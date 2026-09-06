import { ToolMessage, type BaseMessageLike } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { AiTrace, createAiTrace } from "../../../common/trace/ai-trace";
import { Repository } from "typeorm";
import { z } from "zod";
import {
  type AppKnowledgeRecallItem,
  KnowledgeService,
} from "../knowledge/knowledge.service";
import { getAiMessageTokens } from "../knowledge/document-parser/document-multimodal-extraction.service";
import {
  AiAppVersion,
  type AiAppKnowledgeRecallSettings,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageQueryDto,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { LlmUsageType } from "../llm/entities/llm.entity";
import { LlmService, type SpeechAudioChunk } from "../llm/llm.service";
import { AiRuntimeService } from "./ai-runtime.service";
import { ChatAttachmentService } from "./chat-attachment.service";
import { ChatMemoryQueueService } from "./chat-memory-queue.service";
import { ChatMemoryService } from "./chat-memory.service";
import {
  CHAT_MESSAGE_ROLE,
  CHAT_MESSAGE_STATUS,
  ChatMessage,
} from "./entities/chat-message.entity";
import {
  ChatSession,
  type ChatSessionMode,
} from "./entities/chat-session.entity";

const SSE_DONE = "data: [DONE]\n\n";
const OPEN_API_MEMORY_PREFIX = "openapi:";
const PROMPT_OPTIMIZE_SYSTEM_PROMPT = [
  "润色用户提供的人设与回复逻辑，使表达更清晰、通顺、自然。",
  "只调整措辞和逻辑顺序，保留原意、角色、约束和信息量。",
  "不要新增角色、任务、规则、示例或业务设定；不要扩写。",
  "优化结果长度接近原文，最多不超过原文 1.2 倍；原文很短则保持同等长度。",
  "保留原有 Markdown 结构；无结构时不要强行添加复杂结构。",
].join("\n");
const QUESTION_SUGGESTION_SYSTEM_PROMPT = [
  "根据当前对话生成 3 条用户下一步可能直接发送的快捷提问。",
  "必须使用用户最新消息的主要语言；用户使用中文时，建议只能使用中文。",
  "建议要具体、简短、互不重复，不要解释或回答问题。",
].join("\n");
const KNOWLEDGE_QUERY_REWRITE_SYSTEM_PROMPT = [
  "你负责将用户问题改写成用于知识库检索的问题。",
  "请遵循以下规则：",
  "- 不回答问题。",
  "- 不增加历史中不存在的信息。",
  "- 不猜测用户意图。",
  "- 如果用户本轮上传了附件，附件解析内容属于当前问题上下文。",
  "- 如果存在代词（它、这个、那里、前面的接口等），必须根据聊天记录或本轮附件解析内容替换成明确对象。",
  "- 用户问题指向本轮附件、图片或图片中的 ID/编号/名称时，必须优先使用本轮附件解析内容，不要用历史对话中的对象替换。",
  "- 如果用户同时提出多个独立问题，拆分成多个检索问题。",
  "- 如果问题已经完整，不做修改。",
  "- 每个检索问题都必须完整、独立。",
  "示例：",
  "- 当上文对象是登录接口，用户追问“它成功后返回什么”时，将“它”替换为“登录接口”。",
  "- 当用户同时询问“登录接口是什么，字体子集化如何实现”时，识别为两个独立检索意图。",
].join("\n");
const QUERY_REWRITE_FAST_PATH_MAX_LENGTH = 40;
const QUERY_REWRITE_MULTI_QUESTION_MARKERS = ["、", "；", ";", "以及"];
const QuestionSuggestionsSchema = z
  .object({
    suggestions: z
      .array(
        z
          .string()
          .min(1)
          .describe("与用户最新消息语言一致、可直接发送的简短问题"),
      )
      .length(3)
      .describe("三条语言一致且互不重复的后续提问"),
  })
  .strict();
const KnowledgeQueryRewriteSchema = z
  .object({
    queries: z.array(z.string().min(1)).min(1).max(5),
  })
  .strict();
const PromptOptimizeSchema = z
  .object({
    prompt: z.string().min(1),
  })
  .strict();

type SseEvent =
  | { content: string }
  | { contentType: string }
  | { contentType: string; data: string }
  | { message: string }
  | { status: string }
  | {
      sessionId: number;
      conversationId?: string | null;
      userMessageId: number;
      assistantMessageId: number;
    }
  | { elapsedMs: number; tokens?: number }
  | { items: string[] }
  | Record<string, never>
  | KnowledgeCitationEvent
  | AttachmentCitationEvent;

type OpenApiChatParams = {
  appId: number;
  message: string;
  userId: number;
  endUserId: string;
  conversationId?: string;
};

type ParsedSseChunk = {
  event: string;
  data: Record<string, unknown>;
};

type KnowledgeCitation = {
  id: number;
  queries: string[];
  knowledgeId: number;
  knowledgeName: string;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  score: number;
  headingPath?: string[];
  text: string;
};

type KnowledgeCitationEvent = {
  query: string;
  items: KnowledgeCitation[];
};
type AttachmentCitation = {
  id: number;
  attachmentId: number;
  messageId: number;
  fileId: number;
  fileName: string;
  displayLabel?: string;
  duplicateOfLabel?: string | null;
  queries?: string[];
  chunkIndex: number;
  score: number;
  text: string;
};
type AttachmentCitationEvent = {
  query: string;
  items: AttachmentCitation[];
};
type KnowledgeRecallItemWithQuery = AppKnowledgeRecallItem & {
  query: string;
  queries?: string[];
};
type KnowledgeConfig = {
  ids: number[];
  settings: AiAppKnowledgeRecallSettings;
};
type TokenUsageTracker = {
  add: (value: number | undefined) => void;
  total: () => number | undefined;
};
type StructuredOutputWithRaw<T> = {
  parsed: T;
  raw: unknown;
};
type StandaloneSessionItem = {
  id: number;
  appId: number;
  title: string;
  pinnedAt?: Date | null;
  lastMessageAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
type AppStatsDailyItem = {
  date: string;
  sessions: number;
  activeUsers: number;
  tokens: number;
  tokensPerSecond?: number;
};
type AppStatsRecentMessage = {
  id: number;
  mode: ChatSessionMode;
  title: string;
  tokens: number;
  elapsedMs?: number | null;
  createdAt?: Date;
};

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private error: unknown;

  push(item: T) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) {
      this.waiters.shift()?.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown) {
    if (this.closed) return;
    this.closed = true;
    this.error = error;
    while (this.waiters.length) {
      this.waiters.shift()?.reject(error);
    }
  }

  drainReady() {
    return this.items.splice(0);
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.items.length) {
      return { value: this.items.shift() as T, done: false };
    }
    if (this.error) {
      throw this.error instanceof Error
        ? this.error
        : new Error(
            typeof this.error === "string"
              ? this.error
              : (JSON.stringify(this.error) ?? "异步队列执行失败"),
          );
    }
    if (this.closed) return { value: undefined, done: true };

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

type AgentToolCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
type AgentToolRunResult = {
  answer?: string;
  messages: BaseMessageLike[];
};
type AgentToolRunEvent =
  | { type: "tool-call" }
  | { type: "tool-result" }
  | { type: "result"; result: AgentToolRunResult };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    private readonly aiRuntimeService: AiRuntimeService,
    private readonly knowledgeService: KnowledgeService,
    private readonly chatAttachmentService: ChatAttachmentService,
    private readonly chatMemoryService: ChatMemoryService,
    private readonly chatMemoryQueueService: ChatMemoryQueueService,
    private readonly llmService: LlmService,
    private readonly filesService: FilesService,
  ) {}

  private sse(data: SseEvent, event?: string) {
    const prefix = event ? `event: ${event}\n` : "";
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private createMessages(message: string, history: ChatMessage[] = []) {
    const messages: BaseMessageLike[] = [];
    for (const item of history) {
      const content = item.content.trim();
      if (!content) continue;
      messages.push([
        item.role === CHAT_MESSAGE_ROLE.ASSISTANT ? "ai" : "human",
        content,
      ]);
    }
    messages.push(["human", message]);

    return messages;
  }

  private compactText(value: string, maxLength: number) {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  // 分块文本携带“标题路径”标注，压缩进对话上下文时剥离：
  // 章节信息已由“章节”字段单独提供，避免重复占用上下文。
  private stripChunkTextLabels(value: string) {
    const match = /^标题路径:[\s\S]*?\n\n内容:\s*/.exec(value);
    return match ? value.slice(match[0].length) : value;
  }

  private encodeSpeechAudioChunk(chunk: SpeechAudioChunk) {
    return {
      contentType: chunk.contentType,
      data: chunk.buffer.toString("base64"),
    };
  }

  private startSpeechAudioStream(input: AsyncQueue<string>) {
    const output = new AsyncQueue<SpeechAudioChunk>();
    void (async () => {
      try {
        for await (const chunk of this.llmService.streamSynthesizeSpeech(
          input,
        )) {
          output.push(chunk);
        }
        output.close();
      } catch (error) {
        output.fail(error);
      }
    })();

    return output;
  }

  private getKnowledgeHeadingPath(item: AppKnowledgeRecallItem) {
    const metadata = item.metadata ?? {};
    const candidates = [metadata.sectionHeadingPath, metadata.headingPath];
    const headingPath = candidates.find(
      (value): value is string[] =>
        Array.isArray(value) &&
        value.every((item) => typeof item === "string" && item.trim()),
    );

    return headingPath?.map((item) => item.trim());
  }

  private createStructuredOutputModel(temperature = 0) {
    return this.llmService.createDefaultChatModel(LlmUsageType.STRUCTURED, {
      maxRetries: 0,
      temperature,
    });
  }

  async transcribeAppSpeech(appId: number, fileId: number, userId: number) {
    const draft = await this.aiRuntimeService.getDraft(appId, userId);
    return this.transcribeAppSpeechByConfig(draft.config, fileId, userId);
  }

  async transcribeStandaloneAppSpeech(
    appId: number,
    fileId: number,
    userId: number,
  ) {
    const { version } = await this.aiRuntimeService.getStandaloneVersion(
      appId,
      userId,
    );
    return this.transcribeAppSpeechByConfig(version.config, fileId, userId);
  }

  private async transcribeAppSpeechByConfig(
    config: AiAppVersionConfig,
    fileId: number,
    userId: number,
  ) {
    if (!config.toggles?.voiceInput) {
      throw new BadRequestException("应用未开启语音输入");
    }

    const { file, buffer } = await this.filesService.getOwnedObjectBuffer(
      fileId,
      userId,
    );
    if (!file.contentType.toLowerCase().startsWith("audio/")) {
      throw new BadRequestException("请选择音频文件");
    }

    return this.llmService.transcribeAudio({
      buffer,
      contentType: file.contentType,
      filename: file.originalName,
    });
  }

  private createKnowledgeQueryRewriteMessages(
    message: string,
    history: ChatMessage[] = [],
    currentAttachmentContext = "",
  ): BaseMessageLike[] {
    const messages: BaseMessageLike[] = [
      ["system", KNOWLEDGE_QUERY_REWRITE_SYSTEM_PROMPT],
    ];

    for (const item of history.slice(-8)) {
      const content = this.compactText(item.content, 500);
      if (!content) continue;
      messages.push([
        item.role === CHAT_MESSAGE_ROLE.ASSISTANT ? "ai" : "human",
        content,
      ]);
    }
    const attachmentContext = this.compactText(currentAttachmentContext, 1200);
    if (attachmentContext) {
      messages.push([
        "system",
        [
          "以下是用户本轮消息上传附件的解析内容，仅用于消解当前问题中的指代并生成检索问题。",
          "如果用户问题提到“这个/这张图/图片中/附件中/这个ID/会话ID”等，优先从这里提取明确对象。",
          attachmentContext,
        ].join("\n"),
      ]);
    }
    messages.push(["human", message]);

    return messages;
  }

  private normalizeKnowledgeQueries(queries: string[], fallback: string) {
    const normalizedQueries = [
      ...new Set(queries.map((item) => item.trim()).filter(Boolean)),
    ];

    return normalizedQueries.length ? normalizedQueries : [fallback];
  }

  private async rewriteKnowledgeQueries(
    message: string,
    history: ChatMessage[] = [],
    tokenUsage?: TokenUsageTracker,
    currentAttachmentContext = "",
  ) {
    const fallback = message.trim();
    if (!fallback) return [];

    if (
      this.shouldSkipKnowledgeQueryRewrite(
        fallback,
        history,
        currentAttachmentContext,
      )
    ) {
      return [fallback];
    }

    try {
      const model = await this.createStructuredOutputModel();
      const structuredModel = model.withStructuredOutput(
        KnowledgeQueryRewriteSchema,
        {
          name: "KnowledgeQueryRewrite",
          includeRaw: true,
        },
      );
      const response = (await structuredModel.invoke(
        this.createKnowledgeQueryRewriteMessages(
          fallback,
          history,
          currentAttachmentContext,
        ),
      )) as StructuredOutputWithRaw<
        z.infer<typeof KnowledgeQueryRewriteSchema>
      >;
      tokenUsage?.add(getAiMessageTokens(response.raw));
      const queries = this.normalizeKnowledgeQueries(
        response.parsed.queries,
        fallback,
      );

      this.logger.log(
        `知识库检索问题改写完成: message="${this.compactText(fallback, 120)}", history=${history.length}, attachmentContext=${Boolean(currentAttachmentContext)}, queries=${JSON.stringify(queries)}`,
      );

      return queries;
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      this.logger.warn(`知识库检索问题改写失败，使用原问题检索: ${warning}`);
      return [fallback];
    }
  }

  private shouldSkipKnowledgeQueryRewrite(
    message: string,
    history: ChatMessage[] = [],
    currentAttachmentContext = "",
  ) {
    // 无历史、无附件、且问题短且自包含时，改写模型只会原样返回，
    // 直接跳过可省去一次结构化模型调用（约 1-2s 延迟）。
    if (history.length || currentAttachmentContext) return false;
    if (message.length > QUERY_REWRITE_FAST_PATH_MAX_LENGTH) return false;
    if (
      QUERY_REWRITE_MULTI_QUESTION_MARKERS.some((marker) =>
        message.includes(marker),
      )
    ) {
      return false;
    }
    if ((message.match(/[?？]/g) ?? []).length >= 2) return false;
    return true;
  }

  private resolveKnowledgeConfig(config: AiAppVersionConfig): KnowledgeConfig {
    return {
      ids: config.knowledge?.ids ?? [],
      settings: config.knowledge?.settings ?? {},
    };
  }

  private resolveKnowledgeContextItemLimit(knowledgeConfig: KnowledgeConfig) {
    const limit = knowledgeConfig.settings.limit ?? 10;
    return Math.min(20, Math.max(1, Math.floor(limit)));
  }

  private dedupeKnowledgeRecallItems(items: KnowledgeRecallItemWithQuery[]) {
    const itemMap = new Map<string, KnowledgeRecallItemWithQuery>();

    for (const item of items) {
      const chunkKey = `${item.knowledgeId}:${item.chunkId}`;
      const existingItem = itemMap.get(chunkKey);
      if (!existingItem) {
        itemMap.set(chunkKey, {
          ...item,
          queries: [item.query],
        });
        continue;
      }

      if (!existingItem.queries?.includes(item.query)) {
        existingItem.queries = [...(existingItem.queries ?? []), item.query];
      }
    }

    return [...itemMap.values()];
  }

  private orderKnowledgeItemsForCompression(
    items: KnowledgeRecallItemWithQuery[],
  ) {
    const groups = new Map<string, KnowledgeRecallItemWithQuery[]>();

    for (const item of items) {
      const group = groups.get(item.query) ?? [];
      group.push(item);
      groups.set(item.query, group);
    }

    const orderedItems: KnowledgeRecallItemWithQuery[] = [];
    const groupedItems = [...groups.values()];
    for (let index = 0; ; index += 1) {
      let hasItem = false;
      for (const group of groupedItems) {
        const item = group[index];
        if (!item) continue;
        orderedItems.push(item);
        hasItem = true;
      }
      if (!hasItem) break;
    }

    return orderedItems;
  }

  private compressKnowledgeContext(
    items: KnowledgeRecallItemWithQuery[],
    itemLimitPerQuery = 5,
  ) {
    const queryCount = Math.max(
      1,
      new Set(items.map((item) => item.query)).size,
    );
    const maxItems = Math.max(6, queryCount * itemLimitPerQuery);
    const maxItemChars = 900;
    const maxTotalChars = Math.max(5000, maxItems * maxItemChars);
    const citations: KnowledgeCitation[] = [];
    const contextParts: string[] = [];
    let totalChars = 0;
    const uniqueItems = this.dedupeKnowledgeRecallItems(
      this.orderKnowledgeItemsForCompression(items),
    );

    for (const item of uniqueItems) {
      if (citations.length >= maxItems) break;

      const text = this.compactText(
        this.stripChunkTextLabels(item.text),
        maxItemChars,
      );
      if (!text || totalChars + text.length > maxTotalChars) break;

      const citationId = citations.length + 1;
      const itemQueries = item.queries ?? [item.query];
      const headingPath = this.getKnowledgeHeadingPath(item);
      citations.push({
        id: citationId,
        queries: itemQueries,
        knowledgeId: item.knowledgeId,
        knowledgeName: item.knowledgeName,
        documentId: item.documentId,
        documentName: item.documentName,
        chunkIndex: item.chunkIndex,
        score: item.score,
        headingPath,
        text: this.compactText(item.text, 180),
      });
      contextParts.push(
        [
          `资料 ${citationId}：知识库：${item.knowledgeName}`,
          `检索问题：${itemQueries.join("；")}`,
          `文档：${item.documentName} / 片段 #${item.chunkIndex + 1}`,
          headingPath?.length ? `章节：${headingPath.join(" > ")}` : "",
          `匹配度：${item.score}`,
          `内容：${text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      totalChars += text.length;
    }

    return {
      citations,
      context: contextParts.join("\n\n"),
    };
  }

  private async createQuestionSuggestions(
    userMessage: string,
    assistantMessage: string,
    tokenUsage?: TokenUsageTracker,
  ): Promise<string[]> {
    const model = await this.createStructuredOutputModel(1.5);
    const structuredModel = model.withStructuredOutput(
      QuestionSuggestionsSchema,
      {
        name: "QuestionSuggestions",
        includeRaw: true,
      },
    );
    const response = (await structuredModel.invoke([
      ["system", QUESTION_SUGGESTION_SYSTEM_PROMPT],
      ["human", `用户刚才说：${userMessage}\nAI刚才回复：${assistantMessage}`],
    ])) as StructuredOutputWithRaw<z.infer<typeof QuestionSuggestionsSchema>>;
    tokenUsage?.add(getAiMessageTokens(response.raw));

    return response.parsed.suggestions;
  }

  private createPromptOptimizeMessages(
    sourcePrompt: string,
  ): Array<["system" | "human", string]> {
    return [
      ["system", PROMPT_OPTIMIZE_SYSTEM_PROMPT],
      ["human", `请润色下面的人设与回复逻辑，不要扩写：\n\n${sourcePrompt}`],
    ];
  }

  private async runPromptOptimize(model: ChatOpenAI, sourcePrompt: string) {
    const structuredModel = model.withStructuredOutput(PromptOptimizeSchema, {
      name: "PromptOptimize",
    });
    const response = await structuredModel.invoke(
      this.createPromptOptimizeMessages(sourcePrompt),
    );

    return response.prompt.trim();
  }

  private getMessageText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";

    return (content as unknown[])
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  private getToolCalls(message: unknown): AgentToolCall[] {
    const toolCalls = isRecord(message) ? message.tool_calls : undefined;
    if (!Array.isArray(toolCalls)) return [];

    return (toolCalls as unknown[])
      .filter((item): item is AgentToolCall => isRecord(item))
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : undefined,
        name: typeof item.name === "string" ? item.name : undefined,
        args: isRecord(item.args) ? item.args : {},
      }));
  }

  private getToolSchemaShape(tool: StructuredToolInterface) {
    const schema = tool.schema as {
      shape?: unknown;
      _def?: { shape?: unknown };
    };
    const shape = schema.shape ?? schema._def?.shape;

    return typeof shape === "function" ? (shape as () => unknown)() : shape;
  }

  private toolExpectsBody(tool: StructuredToolInterface) {
    const shape = this.getToolSchemaShape(tool);
    return typeof shape === "object" && shape !== null && "body" in shape;
  }

  private normalizeToolArgs(
    tool: StructuredToolInterface,
    args: Record<string, unknown> = {},
  ) {
    const normalizedArgs =
      this.toolExpectsBody(tool) && args.body === undefined
        ? { body: args }
        : args;

    if (typeof normalizedArgs.body !== "string") return normalizedArgs;

    const body = normalizedArgs.body.trim();
    if (!body) return { ...normalizedArgs, body: {} };

    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null) {
        return { ...normalizedArgs, body: parsed };
      }
    } catch {
      return normalizedArgs;
    }

    return normalizedArgs;
  }

  private async *runAgentWithTools(params: {
    model: ChatOpenAI;
    tools: StructuredToolInterface[];
    systemPrompt: string;
    messages: BaseMessageLike[];
    tokenUsage: TokenUsageTracker;
    trace?: AiTrace;
    signal?: AbortSignal;
  }): AsyncGenerator<AgentToolRunEvent> {
    const toolMap = new Map(params.tools.map((item) => [item.name, item]));
    const messages: BaseMessageLike[] = [
      ["system", params.systemPrompt],
      ...params.messages,
    ];
    const modelWithTools = params.model.bindTools(params.tools);
    const maxToolRounds = 8;
    let hasExecutedTools = false;

    for (let round = 1; round <= maxToolRounds; round += 1) {
      if (params.signal?.aborted) return;
      params.trace?.mark("agent.model", { round });
      const aiMessage = await modelWithTools.invoke(messages, {
        signal: params.signal,
      });
      params.tokenUsage.add(getAiMessageTokens(aiMessage));
      const toolCalls = this.getToolCalls(aiMessage);

      if (!toolCalls.length) {
        const answer = this.getMessageText(aiMessage.content).trim();
        if (answer) {
          yield { type: "result", result: { answer, messages } };
          return;
        }
        if (hasExecutedTools) {
          messages.push([
            "human",
            "请基于以上已获得的信息直接回答用户，不要再调用任何工具；如果信息不足，请说明不足。",
          ]);
        }
        yield { type: "result", result: { messages } };
        return;
      }

      yield { type: "tool-call" };
      params.trace?.mark("agent.tool-calls", {
        round,
        count: toolCalls.length,
      });
      messages.push(aiMessage);
      for (const toolCall of toolCalls) {
        if (params.signal?.aborted) return;
        if (!toolCall.id || !toolCall.name) {
          throw new Error(
            `模型返回了无效工具调用：${JSON.stringify(toolCall)}`,
          );
        }

        const selectedTool = toolMap.get(toolCall.name);
        if (!selectedTool) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({
                ok: false,
                error: `工具不存在：${toolCall.name}`,
              }),
              name: toolCall.name,
              tool_call_id: toolCall.id,
            }),
          );
          continue;
        }

        const toolResult = (await selectedTool.invoke({
          type: "tool_call",
          id: toolCall.id,
          name: toolCall.name,
          args: this.normalizeToolArgs(selectedTool, toolCall.args),
        })) as BaseMessageLike;
        messages.push(toolResult);
        params.trace?.mark("agent.tool-result", { tool: toolCall.name });
        hasExecutedTools = true;
      }
      yield { type: "tool-result" };
    }

    messages.push([
      "human",
      "请基于以上已获得的信息直接回答用户，不要再调用任何工具；如果信息不足，请说明不足。",
    ]);

    yield { type: "result", result: { messages } };
  }

  private async *streamModelAnswerChunks(params: {
    model: ChatOpenAI;
    messages: BaseMessageLike[];
    tokenUsage: TokenUsageTracker;
    signal?: AbortSignal;
  }): AsyncGenerator<string> {
    const stream = await params.model.stream(params.messages, {
      signal: params.signal,
    });

    for await (const chunk of stream) {
      if (params.signal?.aborted) return;
      params.tokenUsage.add(getAiMessageTokens(chunk));
      const content = this.getMessageText(chunk.content);
      if (!content) continue;
      yield content;
    }
  }

  private async *streamTextChunks(text: string): AsyncGenerator<string> {
    const chunkSize = 12;
    for (let index = 0; index < text.length; index += chunkSize) {
      yield text.slice(index, index + chunkSize);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }

  private createTokenUsageTracker(): TokenUsageTracker {
    let total = 0;
    let hasUsage = false;

    return {
      add: (value) => {
        if (value === undefined || !Number.isFinite(value) || value < 0) return;
        total += value;
        hasUsage = true;
      },
      total: () => (hasUsage ? total : undefined),
    };
  }

  private createSessionTitle(message: string) {
    return this.compactText(message, 60) || "新会话";
  }

  private toStandaloneSessionItem(session: ChatSession): StandaloneSessionItem {
    return {
      id: session.id,
      appId: session.appId,
      title: session.title || "新对话",
      pinnedAt: session.pinnedAt,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private createStatsDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private normalizeStatsDateKey(value: string | Date) {
    return value instanceof Date
      ? this.createStatsDateKey(value)
      : value.slice(0, 10);
  }

  private createStatsRange(days = 7) {
    const normalizedDays = days === 30 ? 30 : 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - normalizedDays + 1);
    const dateKeys = Array.from({ length: normalizedDays }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return this.createStatsDateKey(date);
    });

    return { days: normalizedDays, start, dateKeys };
  }

  private getStatsDateExpression(alias: string) {
    return `DATE(${this.getStatsColumn(alias, "createdAt")})`;
  }

  private getStatsColumn(alias: string, column: string) {
    const type = this.messageRepository.manager.connection.options.type;
    if (type === "postgres") return `"${alias}"."${column}"`;
    return `\`${alias}\`.\`${column}\``;
  }

  private toNumber(value: unknown) {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private calculateTokensPerSecond(tokens: number, elapsedMs?: number | null) {
    const numericElapsedMs = Number(elapsedMs);
    if (!Number.isFinite(numericElapsedMs) || numericElapsedMs <= 0) {
      return undefined;
    }
    return Number((tokens / (numericElapsedMs / 1000)).toFixed(2));
  }

  async getAppStats(appId: number, userId: number, days = 7) {
    const app = await this.aiRuntimeService.getDraft(appId, userId);
    const { days: rangeDays, start, dateKeys } = this.createStatsRange(days);
    const dailyMap = new Map<string, AppStatsDailyItem>(
      dateKeys.map((date) => [
        date,
        {
          date,
          sessions: 0,
          activeUsers: 0,
          tokens: 0,
        },
      ]),
    );
    const sessionDate = this.getStatsDateExpression("session");
    const messageDate = this.getStatsDateExpression("message");
    const messageRole = this.getStatsColumn("message", "role");
    const messageTokens = this.getStatsColumn("message", "tokens");
    const messageElapsedMs = this.getStatsColumn("message", "elapsedMs");
    const sessionUserId = this.getStatsColumn("session", "userId");
    const speedCondition = `${messageRole} = :assistantRole AND ${messageTokens} IS NOT NULL AND ${messageElapsedMs} IS NOT NULL AND ${messageElapsedMs} > 0`;

    const sessionRows = await this.sessionRepository
      .createQueryBuilder("session")
      .select(sessionDate, "date")
      .addSelect("COUNT(session.id)", "sessions")
      .where("session.appId = :appId", { appId: app.appId })
      .andWhere("session.createdAt >= :start", { start })
      .groupBy(sessionDate)
      .getRawMany<{ date: string | Date; sessions: string }>();
    for (const row of sessionRows) {
      const key = this.normalizeStatsDateKey(row.date);
      const item = dailyMap.get(key);
      if (item) item.sessions = this.toNumber(row.sessions);
    }

    const messageRows = await this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.session", "session")
      .select(messageDate, "date")
      .addSelect(`COUNT(DISTINCT ${sessionUserId})`, "activeUsers")
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${messageRole} = :assistantRole AND ${messageTokens} IS NOT NULL THEN ${messageTokens} ELSE 0 END), 0)`,
        "tokens",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${speedCondition} THEN ${messageTokens} ELSE 0 END), 0)`,
        "speedTokens",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${speedCondition} THEN ${messageElapsedMs} ELSE 0 END), 0)`,
        "speedElapsedMs",
      )
      .where("session.appId = :appId", { appId: app.appId })
      .andWhere("message.createdAt >= :start", { start })
      .setParameters({
        assistantRole: CHAT_MESSAGE_ROLE.ASSISTANT,
      })
      .groupBy(messageDate)
      .getRawMany<{
        date: string | Date;
        activeUsers: string;
        tokens: string;
        speedTokens: string;
        speedElapsedMs: string;
      }>();
    let totalSpeedTokens = 0;
    let totalSpeedElapsedMs = 0;
    for (const row of messageRows) {
      const key = this.normalizeStatsDateKey(row.date);
      const item = dailyMap.get(key);
      if (!item) continue;
      item.activeUsers = this.toNumber(row.activeUsers);
      item.tokens = this.toNumber(row.tokens);
      const speedTokens = this.toNumber(row.speedTokens);
      const speedElapsedMs = this.toNumber(row.speedElapsedMs);
      totalSpeedTokens += speedTokens;
      totalSpeedElapsedMs += speedElapsedMs;
      if (speedElapsedMs > 0) {
        item.tokensPerSecond = this.calculateTokensPerSecond(
          speedTokens,
          speedElapsedMs,
        );
      }
    }

    const daily = [...dailyMap.values()];
    const totals = daily.reduce(
      (summary, item) => ({
        sessions: summary.sessions + item.sessions,
        tokens: summary.tokens + item.tokens,
      }),
      {
        sessions: 0,
        tokens: 0,
      },
    );
    const activeUsers = new Set<number>(
      (
        await this.messageRepository
          .createQueryBuilder("message")
          .innerJoin("message.session", "session")
          .select(sessionUserId, "userId")
          .where("session.appId = :appId", { appId: app.appId })
          .andWhere("message.createdAt >= :start", { start })
          .groupBy(sessionUserId)
          .getRawMany<{ userId: number | string }>()
      ).map((row) => Number(row.userId)),
    ).size;
    const recentMessageRows = await this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.session", "session")
      .select("message.id", "id")
      .addSelect("message.tokens", "tokens")
      .addSelect("message.elapsedMs", "elapsedMs")
      .addSelect("message.createdAt", "createdAt")
      .addSelect("session.mode", "mode")
      .addSelect("session.title", "title")
      .where("session.appId = :appId", { appId: app.appId })
      .andWhere("message.createdAt >= :start", { start })
      .andWhere("message.role = :assistantRole", {
        assistantRole: CHAT_MESSAGE_ROLE.ASSISTANT,
      })
      .andWhere("message.tokens IS NOT NULL")
      .orderBy("message.createdAt", "DESC")
      .limit(10)
      .getRawMany<AppStatsRecentMessage>();
    const recentMessages = recentMessageRows.map((item) => {
      const tokens = Number(item.tokens);
      return {
        id: Number(item.id),
        mode: item.mode,
        title: item.title || "新对话",
        tokens,
        tokensPerSecond: this.calculateTokensPerSecond(tokens, item.elapsedMs),
        createdAt: item.createdAt,
      };
    });

    return {
      range: {
        days: rangeDays,
        start: this.createStatsDateKey(start),
        end: this.createStatsDateKey(new Date()),
      },
      overview: {
        sessions: totals.sessions,
        activeUsers,
        tokens: totals.tokens,
        tokensPerSecond:
          totalSpeedElapsedMs > 0
            ? this.calculateTokensPerSecond(
                totalSpeedTokens,
                totalSpeedElapsedMs,
              )
            : undefined,
      },
      daily,
      recentMessages,
    };
  }

  private async ensureStandaloneSession(
    appId: number,
    sessionId: number,
    userId: number,
  ) {
    await this.aiRuntimeService.getStandaloneVersion(appId, userId);
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, appId, userId, mode: "standalone" },
    });
    if (!session) throw new NotFoundException("对话会话不存在");
    return session;
  }

  private async resolveChatSession(params: {
    appId: number;
    userId: number;
    sessionId?: number;
    conversationId?: string;
    externalUserId?: string;
    message: string;
    mode: ChatSessionMode;
  }) {
    if (params.sessionId || params.conversationId) {
      const session = await this.sessionRepository.findOne({
        where: params.conversationId
          ? { publicId: params.conversationId }
          : { id: params.sessionId },
      });
      if (!session) throw new NotFoundException("对话会话不存在");
      if (
        session.userId !== params.userId ||
        session.appId !== params.appId ||
        session.mode !== params.mode ||
        (params.mode === "openapi" &&
          session.externalUserId !== params.externalUserId)
      ) {
        throw new ForbiddenException("无权访问该对话会话");
      }
      return session;
    }

    return this.sessionRepository.save(
      this.sessionRepository.create({
        appId: params.appId,
        userId: params.userId,
        mode: params.mode,
        publicId: params.mode === "openapi" ? randomUUID() : null,
        externalUserId:
          params.mode === "openapi" ? params.externalUserId : null,
        title: this.createSessionTitle(params.message),
        lastMessageAt: new Date(),
        createdBy: params.userId,
        updatedBy: params.userId,
      }),
    );
  }

  private async saveUserMessage(params: {
    session: ChatSession;
    content: string;
    userId: number;
    attachmentFileIds: number[];
  }) {
    const message = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: params.session.id,
        role: CHAT_MESSAGE_ROLE.USER,
        content: params.content,
        status: CHAT_MESSAGE_STATUS.COMPLETED,
        metadata: params.attachmentFileIds.length
          ? { attachmentFileIds: params.attachmentFileIds }
          : null,
        createdBy: params.userId,
        updatedBy: params.userId,
      }),
    );
    await this.sessionRepository.update(params.session.id, {
      lastMessageAt: new Date(),
      updatedBy: params.userId,
    });

    return message;
  }

  private async createAssistantMessage(session: ChatSession, userId: number) {
    return this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        role: CHAT_MESSAGE_ROLE.ASSISTANT,
        content: "",
        status: CHAT_MESSAGE_STATUS.STREAMING,
        createdBy: userId,
        updatedBy: userId,
      }),
    );
  }

  private resolveContextMessageLimit(config: AiAppVersionConfig) {
    const rounds = config.modelSettings?.contextRounds ?? 10;
    return Math.min(200, Math.max(2, Math.floor(rounds) * 2));
  }

  private async loadRecentHistory(params: {
    sessionId: number;
    beforeMessageId: number;
    limit: number;
  }) {
    const rows = await this.messageRepository
      .createQueryBuilder("message")
      .where("message.sessionId = :sessionId", { sessionId: params.sessionId })
      .andWhere("message.id < :beforeMessageId", {
        beforeMessageId: params.beforeMessageId,
      })
      .andWhere("message.status = :status", {
        status: CHAT_MESSAGE_STATUS.COMPLETED,
      })
      .andWhere("message.content <> ''")
      .orderBy("message.id", "DESC")
      .take(params.limit)
      .getMany();

    return rows.reverse();
  }

  async optimizePrompt(appId: number, prompt: string, userId: number) {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt) {
      throw new BadRequestException("人设与回复逻辑不能为空");
    }

    const draft = await this.aiRuntimeService.getDraft(appId, userId);
    const model = await this.aiRuntimeService.createModel(draft.config);
    const optimizedPrompt = await this.runPromptOptimize(model, sourcePrompt);
    if (!optimizedPrompt) {
      throw new BadRequestException("模型未生成有效优化结果");
    }

    return { prompt: optimizedPrompt };
  }

  createPromptOptimizeSseStream(
    appId: number,
    prompt: string,
    userId: number,
  ): Readable {
    return Readable.from(this.streamPromptOptimize(appId, prompt, userId));
  }

  private async *streamPromptOptimize(
    appId: number,
    prompt: string,
    userId: number,
  ): AsyncGenerator<string> {
    const sourcePrompt = prompt.trim();

    try {
      if (!sourcePrompt) {
        throw new BadRequestException("人设与回复逻辑不能为空");
      }

      const draft = await this.aiRuntimeService.getDraft(appId, userId);
      const model = await this.aiRuntimeService.createModel(draft.config);
      const optimizedPrompt = await this.runPromptOptimize(model, sourcePrompt);

      if (!optimizedPrompt) {
        throw new BadRequestException("模型未生成有效优化结果");
      }
      yield this.sse({ content: optimizedPrompt });

      yield SSE_DONE;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Prompt优化失败: ${message}`, stack);
      yield this.sse({ message }, "error");
    }
  }

  createAppDebugSseStream(
    appId: number,
    message: string,
    userId: number,
    sessionId?: number,
    attachmentFileIds: number[] = [],
  ): Readable {
    return this.createAbortableAppChatStream((signal) =>
      this.streamAppChat({
        appId,
        message,
        userId,
        sessionId,
        attachmentFileIds,
        signal,
        resolveRuntime: async () => ({
          version: await this.aiRuntimeService.getDraft(appId, userId),
          resourceUserId: userId,
        }),
        mode: "debug",
      }),
    );
  }

  createStandaloneAppSseStream(
    appId: number,
    message: string,
    userId: number,
    sessionId?: number,
    attachmentFileIds: number[] = [],
  ): Readable {
    return this.createAbortableAppChatStream((signal) =>
      this.streamAppChat({
        appId,
        message,
        userId,
        sessionId,
        attachmentFileIds,
        signal,
        resolveRuntime: async () => {
          const runtime = await this.aiRuntimeService.getStandaloneVersion(
            appId,
            userId,
          );
          return {
            version: runtime.version,
            resourceUserId: runtime.resourceUserId,
          };
        },
        mode: "standalone",
      }),
    );
  }

  createOpenApiSseStream(params: OpenApiChatParams): Readable {
    return Readable.from(this.streamOpenApiSse(params));
  }

  private async *streamOpenApiSse(params: OpenApiChatParams) {
    for await (const chunk of this.createOpenApiChatGenerator(params)) {
      const parsed = this.parseSseChunk(chunk);
      yield parsed ? this.serializeOpenApiSse(parsed) : chunk;
    }
  }

  async runOpenApiChat(params: OpenApiChatParams) {
    const startedAt = Date.now();
    let conversationId = "";
    let messageId = "";
    let answer = "";
    let elapsedMs: number | undefined;
    let tokens: number | undefined;
    let citations: unknown[] = [];

    for await (const chunk of this.createOpenApiChatGenerator(params, true)) {
      const parsed = this.parseSseChunk(chunk);
      if (!parsed) continue;
      const { event, data } = parsed;

      if (event === "session") {
        conversationId = this.toOpenApiText(data.conversationId);
        messageId = this.toOpenApiText(data.assistantMessageId);
      } else if (event === "message") {
        answer += typeof data.content === "string" ? data.content : "";
      } else if (event === "knowledge") {
        citations = Array.isArray(data.items) ? data.items : [];
      } else if (event === "meta") {
        elapsedMs =
          typeof data.elapsedMs === "number" ? data.elapsedMs : undefined;
        tokens = typeof data.tokens === "number" ? data.tokens : undefined;
      }
    }

    const completedAt = Date.now();
    return {
      data: {
        id: messageId,
        conversation_id: conversationId,
        app_id: params.appId,
        end_user_id: params.endUserId,
        answer,
        status: "completed",
        created_at: Math.floor(startedAt / 1000),
        completed_at: Math.floor(completedAt / 1000),
        bot_id: String(params.appId),
        usage: {
          elapsed_ms: elapsedMs ?? completedAt - startedAt,
          total_tokens: tokens ?? null,
        },
        citations,
      },
    };
  }

  private parseSseChunk(chunk: string): ParsedSseChunk | undefined {
    if (chunk === SSE_DONE) return undefined;

    const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
    if (!dataLine || dataLine === "[DONE]") return undefined;

    try {
      return {
        event: chunk.match(/^event: ([^\n]+)/m)?.[1] ?? "message",
        data: JSON.parse(dataLine) as Record<string, unknown>,
      };
    } catch {
      return undefined;
    }
  }

  private toOpenApiText(value: unknown) {
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
  }

  private serializeOpenApiSse({ event, data }: ParsedSseChunk) {
    if (event === "session") {
      return this.serializeSseData(
        {
          conversation_id: data.conversationId,
          id: data.assistantMessageId,
          user_message_id: data.userMessageId,
        },
        "session",
      );
    }
    if (event === "meta") {
      return this.serializeSseData(
        {
          elapsed_ms: data.elapsedMs,
          total_tokens: data.tokens ?? null,
        },
        "meta",
      );
    }
    const prefix = event === "message" ? "" : `event: ${event}\n`;
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private serializeSseData(data: Record<string, unknown>, event?: string) {
    const prefix = event ? `event: ${event}\n` : "";
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private createOpenApiChatGenerator(
    params: OpenApiChatParams,
    throwErrors = false,
  ) {
    return this.streamAppChat({
      appId: params.appId,
      message: params.message,
      userId: params.userId,
      conversationId: params.conversationId,
      externalUserId: params.endUserId,
      resolveRuntime: async () => {
        const runtime = await this.aiRuntimeService.getOpenApiVersion(
          params.appId,
          params.userId,
        );
        return {
          version: runtime.version,
          resourceUserId: runtime.resourceUserId,
        };
      },
      mode: "openapi",
      throwErrors,
    });
  }

  async listStandaloneSessions(
    appId: number,
    userId: number,
    query: PageQueryDto,
  ): Promise<PageResult<StandaloneSessionItem>> {
    await this.aiRuntimeService.getStandaloneVersion(appId, userId);
    const { page, pageSize, skip } = resolvePageQuery(query);
    const [sessions, total] = await this.sessionRepository
      .createQueryBuilder("session")
      .where("session.appId = :appId", { appId })
      .andWhere("session.userId = :userId", { userId })
      .andWhere("session.mode = :mode", { mode: "standalone" })
      .orderBy("session.pinnedAt IS NULL", "ASC")
      .addOrderBy("session.pinnedAt", "DESC")
      .addOrderBy("session.lastMessageAt", "DESC")
      .addOrderBy("session.updatedAt", "DESC")
      .addOrderBy("session.id", "DESC")
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return createPageResult(
      sessions.map((session) => this.toStandaloneSessionItem(session)),
      total,
      page,
      pageSize,
    );
  }

  async updateStandaloneSession(
    appId: number,
    sessionId: number,
    userId: number,
    payload: { title: string },
  ) {
    const session = await this.ensureStandaloneSession(
      appId,
      sessionId,
      userId,
    );
    session.title = this.compactText(payload.title, 120) || "新对话";
    session.updatedBy = userId;
    return this.toStandaloneSessionItem(
      await this.sessionRepository.save(session),
    );
  }

  async deleteStandaloneSession(
    appId: number,
    sessionId: number,
    userId: number,
  ) {
    const session = await this.ensureStandaloneSession(
      appId,
      sessionId,
      userId,
    );
    await this.chatAttachmentService.deleteSessionAttachments(session.id);
    await this.sessionRepository.delete(session.id);
    return { id: session.id };
  }

  async setStandaloneSessionPinned(
    appId: number,
    sessionId: number,
    userId: number,
    pinned: boolean,
  ) {
    const session = await this.ensureStandaloneSession(
      appId,
      sessionId,
      userId,
    );
    session.pinnedAt = pinned ? new Date() : null;
    session.updatedBy = userId;
    return this.toStandaloneSessionItem(
      await this.sessionRepository.save(session),
    );
  }

  async listStandaloneSessionMessages(
    appId: number,
    sessionId: number,
    userId: number,
    query: PageQueryDto,
  ) {
    const session = await this.ensureStandaloneSession(
      appId,
      sessionId,
      userId,
    );
    const { page, pageSize, skip } = resolvePageQuery(query);
    const [messages, total] = await this.messageRepository.findAndCount({
      where: { sessionId },
      relations: { attachments: { file: true } },
      order: { id: "DESC" },
      skip,
      take: pageSize,
    });

    return createPageResult(
      messages.reverse().map((item) => ({
        id: item.id,
        sessionId: session.id,
        role: item.role,
        content: item.content,
        status: item.status,
        elapsedMs: item.elapsedMs,
        tokens: item.tokens,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        attachments: (item.attachments ?? [])
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((attachment) => ({
            uid: String(attachment.id),
            fileId: attachment.fileId,
            name: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            url: this.filesService.createAccessibleUrl(attachment.file?.url),
          })),
      })),
      total,
      page,
      pageSize,
    );
  }

  private async *streamAppChat(params: {
    appId: number;
    message: string;
    userId: number;
    sessionId?: number;
    conversationId?: string;
    externalUserId?: string;
    attachmentFileIds?: number[];
    resolveRuntime: () => Promise<{
      version: AiAppVersion;
      resourceUserId: number;
    }>;
    mode: ChatSessionMode;
    throwErrors?: boolean;
    signal?: AbortSignal;
  }): AsyncGenerator<string> {
    const {
      appId,
      message,
      userId,
      sessionId,
      conversationId,
      externalUserId,
      attachmentFileIds = [],
      resolveRuntime,
      mode,
      throwErrors = false,
      signal,
    } = params;
    const startedAt = Date.now();
    let output = "";
    let assistantMessage: ChatMessage | undefined;
    let activeSpeechInput: AsyncQueue<string> | undefined;
    const tokenUsage = this.createTokenUsageTracker();
    const trace = createAiTrace("chat.stream", { appId, mode, userId });
    let messageFinalized = false;

    const isAborted = () => signal?.aborted === true;

    try {
      const content = message.trim();
      if (!content) {
        throw new BadRequestException("消息内容不能为空");
      }
      const { version, resourceUserId } = await trace.step(
        "resolve-runtime",
        resolveRuntime,
      );
      const model = await trace.step("create-model", () =>
        this.aiRuntimeService.createModel(version.config),
      );
      const speechInput =
        mode !== "openapi" && version.config.toggles?.voiceOutput
          ? new AsyncQueue<string>()
          : undefined;
      activeSpeechInput = speechInput;
      const speechOutput = speechInput
        ? this.startSpeechAudioStream(speechInput)
        : undefined;
      let speechStarted = false;
      const sse = this.sse.bind(this);
      const encodeSpeechAudioChunk = this.encodeSpeechAudioChunk.bind(this);
      const drainReadySpeechAudio = function* () {
        for (const chunk of speechOutput?.drainReady() ?? []) {
          yield sse(encodeSpeechAudioChunk(chunk), "audio");
        }
      };
      const emitContent = function* (value: string) {
        output += value;
        if (speechInput) {
          if (!speechStarted) {
            speechStarted = true;
            yield sse({ contentType: "audio/mpeg" }, "audio-start");
          }
          speechInput.push(value);
        }
        yield sse({ content: value });
        yield* drainReadySpeechAudio();
      };
      const finishSpeech = async function* () {
        if (!speechInput || !speechOutput) return;
        speechInput.close();
        try {
          for await (const chunk of speechOutput) {
            yield sse(encodeSpeechAudioChunk(chunk), "audio");
          }
          yield sse({}, "audio-end");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          yield sse({ message }, "audio-error");
        }
      };
      const session = await this.resolveChatSession({
        appId,
        userId,
        sessionId,
        conversationId,
        externalUserId,
        message: content,
        mode,
      });
      const userMessage = await this.saveUserMessage({
        session,
        content,
        userId,
        attachmentFileIds,
      });
      assistantMessage = await this.createAssistantMessage(session, userId);
      if (isAborted()) return;
      yield this.sse(
        {
          sessionId: session.id,
          conversationId: session.publicId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        },
        "session",
      );

      if (attachmentFileIds.length) {
        yield this.sse({ status: "解析附件中" }, "status");
      }
      const currentAttachmentContext = await trace.step(
        "process-attachments",
        () =>
          this.chatAttachmentService.processMessageAttachments({
            session,
            message: userMessage,
            fileIds: attachmentFileIds,
            userId,
          }),
      );
      if (isAborted()) return;
      tokenUsage.add(currentAttachmentContext.tokens);
      const history = await this.loadRecentHistory({
        sessionId: session.id,
        beforeMessageId: userMessage.id,
        limit: this.resolveContextMessageLimit(version.config),
      });
      if (isAborted()) return;
      const knowledgeConfig = this.resolveKnowledgeConfig(version.config);
      const longTermMemoryEnabled =
        version.config.toggles?.longTermMemory ?? false;
      const memoryKey = externalUserId
        ? `${OPEN_API_MEMORY_PREFIX}${externalUserId}`
        : undefined;
      const [longTermMemoryContext, sessionSummaryContext] =
        longTermMemoryEnabled
          ? await Promise.all([
              this.chatMemoryService.createLongTermMemoryContext(
                appId,
                userId,
                memoryKey,
              ),
              this.chatMemoryService.createSessionSummaryContext(session.id),
            ])
          : ["", ""];
      const hasHistoricalAttachments =
        await this.chatAttachmentService.hasRecallableChunks(session.id, {
          excludeMessageId: userMessage.id,
        });
      if (knowledgeConfig.ids.length || hasHistoricalAttachments) {
        yield this.sse({ status: "完善用户问题" }, "status");
      }
      const recallQueries =
        knowledgeConfig.ids.length || hasHistoricalAttachments
          ? await trace.step("rewrite-query", () =>
              this.rewriteKnowledgeQueries(
                content,
                history,
                tokenUsage,
                currentAttachmentContext.context,
              ),
            )
          : [content];
      if (knowledgeConfig.ids.length || hasHistoricalAttachments) {
        yield this.sse({ status: "检索知识库中" }, "status");
      }
      const [historicalAttachmentRecall, recalledItems] = await trace.step(
        "recall",
        () =>
          Promise.all([
            hasHistoricalAttachments
              ? Promise.all(
                  recallQueries.map((query) =>
                    this.chatAttachmentService.createRecallContext(
                      session.id,
                      query,
                      {
                        excludeMessageId: userMessage.id,
                      },
                    ),
                  ),
                ).then((results) => ({
                  context: results
                    .map((result) => result.context)
                    .filter(Boolean)
                    .join("\n\n"),
                  items: results.flatMap((result) => result.items),
                  tokens: results.some((result) => result.tokens !== undefined)
                    ? results.reduce(
                        (total, result) => total + (result.tokens ?? 0),
                        0,
                      )
                    : undefined,
                }))
              : Promise.resolve({
                  context: "",
                  items: [],
                  tokens: undefined,
                }),
            knowledgeConfig.ids.length
              ? Promise.all(
                  recallQueries.map(async (query) => {
                    const result =
                      await this.knowledgeService.recallForAppWithUsage({
                        knowledgeIds: knowledgeConfig.ids,
                        settings: knowledgeConfig.settings,
                        query,
                        userId: resourceUserId,
                      });
                    tokenUsage.add(result.tokens);

                    return result.items.map((item) => ({ ...item, query }));
                  }),
                ).then((items) => items.flat())
              : Promise.resolve([] as KnowledgeRecallItemWithQuery[]),
          ]),
      );
      if (isAborted()) return;
      tokenUsage.add(historicalAttachmentRecall.tokens);
      const attachmentItems = [
        ...currentAttachmentContext.items,
        ...historicalAttachmentRecall.items,
      ].map((item, index) => ({ ...item, id: index + 1 }));
      const contextItemLimit =
        this.resolveKnowledgeContextItemLimit(knowledgeConfig);
      const { context: knowledgeContext, citations } =
        this.compressKnowledgeContext(recalledItems, contextItemLimit);

      if (citations.length) {
        yield this.sse(
          {
            query: recallQueries.join("；"),
            items: citations,
          },
          "knowledge",
        );
      }
      if (attachmentItems.length) {
        yield this.sse(
          {
            query: recallQueries.join("；"),
            items: attachmentItems,
          },
          "attachments",
        );
      }
      yield this.sse({ status: "生成回复中" }, "status");

      const { agent, tools, systemPrompt } = await trace.step(
        "create-agent",
        () =>
          this.aiRuntimeService.createAgentFromDraft(
            version,
            model,
            resourceUserId,
            {
              longTermMemoryContext,
              sessionSummaryContext,
              knowledgeContext,
              currentAttachmentContext: currentAttachmentContext.context,
              recalledAttachmentContext: historicalAttachmentRecall.context,
            },
          ),
      );
      if (isAborted()) return;
      const messages = this.createMessages(content, history);

      if (tools.length) {
        let result: AgentToolRunResult | undefined;
        let pluginStatusSent = false;
        const toolRun = this.runAgentWithTools({
          model,
          tools,
          systemPrompt,
          messages,
          tokenUsage,
          trace,
          signal,
        });
        for await (const event of toolRun) {
          if (event.type === "tool-call") {
            if (!pluginStatusSent) {
              pluginStatusSent = true;
              yield this.sse({ status: "调用插件获取数据中" }, "status");
            }
            continue;
          }
          if (event.type === "tool-result") {
            yield this.sse({ status: "整理插件结果中" }, "status");
            continue;
          }
          result = event.result;
        }
        if (!result) {
          result = { messages };
        }
        if (pluginStatusSent) {
          yield this.sse({ status: "生成回复中" }, "status");
        }
        const answerStream = result.answer
          ? this.streamTextChunks(result.answer)
          : this.streamModelAnswerChunks({
              model,
              messages: result.messages,
              tokenUsage,
              signal,
            });
        for await (const chunk of answerStream) {
          if (isAborted()) return;
          yield* emitContent(chunk);
        }
      } else {
        trace.mark("agent.stream-start");
        const run = await agent.streamEvents(
          { messages },
          { version: "v3", signal },
        );

        for await (const item of run.messages) {
          if (isAborted()) return;
          for await (const content of item.text) {
            if (isAborted()) return;
            yield* emitContent(content);
          }
        }
        const result = await run.output;
        tokenUsage.add(getAiMessageTokens(result.messages));
        trace.mark("agent.stream-complete");
      }
      yield* finishSpeech();

      if (version.config.toggles?.questionSuggestions) {
        yield this.sse({ status: "生成追问建议中" }, "status");
        let suggestions: string[] = [];
        try {
          suggestions = await this.createQuestionSuggestions(
            content,
            output,
            tokenUsage,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;

          this.logger.warn(`用户问题建议生成失败: ${message}`, stack);
        }
        yield this.sse({ items: suggestions }, "suggestions");
      }

      await this.messageRepository.update(assistantMessage.id, {
        content: output,
        status: CHAT_MESSAGE_STATUS.COMPLETED,
        elapsedMs: Date.now() - startedAt,
        tokens: tokenUsage.total(),
        updatedBy: userId,
      });
      messageFinalized = true;
      await this.sessionRepository.update(session.id, {
        lastMessageAt: new Date(),
        updatedBy: userId,
      });

      yield this.sse(
        {
          elapsedMs: Date.now() - startedAt,
          tokens: tokenUsage.total(),
        },
        "meta",
      );

      if (longTermMemoryEnabled) {
        await this.chatMemoryQueueService.enqueueRefresh({
          appId,
          userId,
          sessionId: session.id,
          memoryKey,
          contextRounds: version.config.modelSettings?.contextRounds,
        });
      }

      yield SSE_DONE;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`AI应用调试失败: ${message}`, stack);
      if (assistantMessage) {
        await this.messageRepository.update(assistantMessage.id, {
          content: output || message,
          status: isAborted()
            ? CHAT_MESSAGE_STATUS.STOPPED
            : CHAT_MESSAGE_STATUS.FAILED,
          updatedBy: userId,
        });
        messageFinalized = true;
      }
      if (!isAborted()) {
        if (throwErrors) throw error;
        yield this.sse({ message }, "error");
      }
    } finally {
      activeSpeechInput?.close();
      if (assistantMessage && !messageFinalized && isAborted()) {
        try {
          await this.messageRepository.update(assistantMessage.id, {
            content: output,
            status: CHAT_MESSAGE_STATUS.STOPPED,
            updatedBy: userId,
          });
          messageFinalized = true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`停止AI对话时更新消息状态失败: ${message}`);
        }
      }
      trace.end({ outputLength: output.length });
    }
  }

  private createAbortableAppChatStream(
    createGenerator: (signal: AbortSignal) => AsyncGenerator<string>,
  ): Readable {
    const controller = new AbortController();
    const stream = Readable.from(createGenerator(controller.signal));
    stream.once("close", () => controller.abort());
    stream.once("error", () => controller.abort());
    return stream;
  }
}
