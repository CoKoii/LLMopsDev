import { type BaseMessageLike } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Readable } from "node:stream";
import { Repository } from "typeorm";
import { z } from "zod";
import { getAiEnvironment } from "../../../common/config/env";
import {
  type AppKnowledgeRecallItem,
  KnowledgeService,
} from "../knowledge/knowledge.service";
import { getAiMessageTokens } from "../knowledge/document-parser/document-multimodal-extraction.service";
import {
  type AiAppKnowledgeRecallSettings,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { AiRuntimeService } from "./ai-runtime.service";
import { ChatAttachmentService } from "./chat-attachment.service";
import { ChatMemoryQueueService } from "./chat-memory-queue.service";
import { ChatMemoryService } from "./chat-memory.service";
import {
  CHAT_MESSAGE_ROLE,
  CHAT_MESSAGE_STATUS,
  ChatMessage,
} from "./entities/chat-message.entity";
import { ChatSession } from "./entities/chat-session.entity";

const SSE_DONE = "data: [DONE]\n\n";
const PROMPT_OPTIMIZE_SYSTEM_PROMPT = [
  "润色用户提供的人设与回复逻辑，使表达更清晰、通顺、自然。",
  "只调整措辞和逻辑顺序，保留原意、角色、约束和信息量。",
  "不要新增角色、任务、规则、示例或业务设定；不要扩写。",
  "优化结果长度接近原文，最多不超过原文 1.2 倍；原文很短则保持同等长度。",
  "保留原有 Markdown 结构；无结构时不要强行添加复杂结构。",
].join("\n");
const QUESTION_SUGGESTION_SYSTEM_PROMPT = [
  "生成聊天输入框下方的快捷提问按钮。",
  "内容要像用户下一步会直接发送的话。",
  "优先生成具体、可点击的短命令。",
].join("\n");
const KNOWLEDGE_QUERY_REWRITE_SYSTEM_PROMPT = [
  "你负责将用户问题改写成用于知识库检索的问题。",
  "请遵循以下规则：",
  "- 不回答问题。",
  "- 不增加历史中不存在的信息。",
  "- 不猜测用户意图。",
  "- 如果存在代词（它、这个、那里、前面的接口等），必须根据聊天记录替换成明确对象。",
  "- 如果用户同时提出多个独立问题，拆分成多个检索问题。",
  "- 如果问题已经完整，不做修改。",
  "- 每个检索问题都必须完整、独立。",
  "示例：",
  "- 当上文对象是登录接口，用户追问“它成功后返回什么”时，将“它”替换为“登录接口”。",
  "- 当用户同时询问“登录接口是什么，字体子集化如何实现”时，识别为两个独立检索意图。",
].join("\n");
const QuestionSuggestionsSchema = z
  .object({
    suggestions: z.array(z.string().min(1)).length(3),
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
  | { message: string }
  | { sessionId: number; userMessageId: number; assistantMessageId: number }
  | { elapsedMs: number; tokens?: number }
  | { items: string[] }
  | KnowledgeCitationEvent
  | AttachmentCitationEvent;

type KnowledgeCitation = {
  id: number;
  queries: string[];
  knowledgeId: number;
  knowledgeName: string;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  score: number;
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
    private readonly configService: ConfigService,
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

  private createStructuredOutputModel(temperature = 0) {
    const config = getAiEnvironment(this.configService).structuredOutput;

    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      maxRetries: 0,
      temperature,
      configuration: { baseURL: config.baseUrl },
    });
  }

  private createKnowledgeQueryRewriteMessages(
    message: string,
    history: ChatMessage[] = [],
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
  ) {
    const fallback = message.trim();
    if (!fallback) return [];

    try {
      const model = this.createStructuredOutputModel();
      const structuredModel = model.withStructuredOutput(
        KnowledgeQueryRewriteSchema,
        {
          name: "KnowledgeQueryRewrite",
          includeRaw: true,
        },
      );
      const response = (await structuredModel.invoke(
        this.createKnowledgeQueryRewriteMessages(fallback, history),
      )) as StructuredOutputWithRaw<z.infer<typeof KnowledgeQueryRewriteSchema>>;
      tokenUsage?.add(getAiMessageTokens(response.raw));
      const queries = this.normalizeKnowledgeQueries(
        response.parsed.queries,
        fallback,
      );

      this.logger.log(
        `知识库检索问题改写完成: message="${this.compactText(fallback, 120)}", history=${history.length}, queries=${JSON.stringify(queries)}`,
      );

      return queries;
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      this.logger.warn(`知识库检索问题改写失败，使用原问题检索: ${warning}`);
      return [fallback];
    }
  }

  private resolveKnowledgeConfig(config: AiAppVersionConfig): KnowledgeConfig {
    return {
      ids: config.knowledge?.ids ?? [],
      settings: config.knowledge?.settings ?? {},
    };
  }

  private resolveKnowledgeContextItemLimit(knowledgeConfig: KnowledgeConfig) {
    const limit = knowledgeConfig.settings.limit ?? 5;
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
    const maxTotalChars = Math.max(5000, queryCount * 3500);
    const citations: KnowledgeCitation[] = [];
    const contextParts: string[] = [];
    let totalChars = 0;
    const uniqueItems = this.dedupeKnowledgeRecallItems(
      this.orderKnowledgeItemsForCompression(items),
    );

    for (const item of uniqueItems) {
      if (citations.length >= maxItems) break;

      const text = this.compactText(item.text, maxItemChars);
      if (!text || totalChars + text.length > maxTotalChars) break;

      const citationId = citations.length + 1;
      const itemQueries = item.queries ?? [item.query];
      citations.push({
        id: citationId,
        queries: itemQueries,
        knowledgeId: item.knowledgeId,
        knowledgeName: item.knowledgeName,
        documentId: item.documentId,
        documentName: item.documentName,
        chunkIndex: item.chunkIndex,
        score: item.score,
        text: this.compactText(item.text, 180),
      });
      contextParts.push(
        [
          `资料 ${citationId}：知识库：${item.knowledgeName}`,
          `检索问题：${itemQueries.join("；")}`,
          `文档：${item.documentName} / 片段 #${item.chunkIndex + 1}`,
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
    const model = this.createStructuredOutputModel(1.5);
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

  private getTotalTokens(messages: BaseMessageLike[]) {
    return getAiMessageTokens(messages) || undefined;
  }

  private createTokenUsageTracker(): TokenUsageTracker {
    let total = 0;

    return {
      add: (value) => {
        if (value && Number.isFinite(value)) total += value;
      },
      total: () => total || undefined,
    };
  }

  private createSessionTitle(message: string) {
    return this.compactText(message, 60) || "新会话";
  }

  private async resolveDebugSession(params: {
    appId: number;
    userId: number;
    sessionId?: number;
    message: string;
  }) {
    if (params.sessionId) {
      const session = await this.sessionRepository.findOne({
        where: { id: params.sessionId },
      });
      if (!session) throw new NotFoundException("对话会话不存在");
      if (session.userId !== params.userId || session.appId !== params.appId) {
        throw new ForbiddenException("无权访问该对话会话");
      }
      return session;
    }

    return this.sessionRepository.save(
      this.sessionRepository.create({
        appId: params.appId,
        userId: params.userId,
        mode: "debug",
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
    return Readable.from(
      this.streamAppDebug(appId, message, userId, sessionId, attachmentFileIds),
    );
  }

  private async *streamAppDebug(
    appId: number,
    message: string,
    userId: number,
    sessionId?: number,
    attachmentFileIds: number[] = [],
  ): AsyncGenerator<string> {
    const startedAt = Date.now();
    let output = "";
    let assistantMessage: ChatMessage | undefined;
    const tokenUsage = this.createTokenUsageTracker();

    try {
      const content = message.trim();
      if (!content) {
        throw new BadRequestException("消息内容不能为空");
      }
      const draft = await this.aiRuntimeService.getDraft(appId, userId);
      const model = await this.aiRuntimeService.createModel(draft.config);
      const session = await this.resolveDebugSession({
        appId,
        userId,
        sessionId,
        message: content,
      });
      const userMessage = await this.saveUserMessage({
        session,
        content,
        userId,
        attachmentFileIds,
      });
      assistantMessage = await this.createAssistantMessage(session, userId);
      yield this.sse(
        {
          sessionId: session.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        },
        "session",
      );

      const currentAttachmentContext =
        await this.chatAttachmentService.processMessageAttachments({
          session,
          message: userMessage,
          fileIds: attachmentFileIds,
          userId,
        });
      tokenUsage.add(currentAttachmentContext.tokens);
      const history = await this.loadRecentHistory({
        sessionId: session.id,
        beforeMessageId: userMessage.id,
        limit: this.resolveContextMessageLimit(draft.config),
      });
      const knowledgeConfig = this.resolveKnowledgeConfig(draft.config);
      const longTermMemoryEnabled =
        draft.config.toggles?.longTermMemory ?? false;
      const [longTermMemoryContext, sessionSummaryContext] =
        longTermMemoryEnabled
          ? await Promise.all([
              this.chatMemoryService.createLongTermMemoryContext(appId, userId),
              this.chatMemoryService.createSessionSummaryContext(session.id),
            ])
          : ["", ""];
      const hasHistoricalAttachments =
        await this.chatAttachmentService.hasRecallableChunks(session.id, {
          excludeMessageId: userMessage.id,
        });
      const recallQueries = knowledgeConfig.ids.length || hasHistoricalAttachments
        ? await this.rewriteKnowledgeQueries(content, history, tokenUsage)
        : [content];
      const [historicalAttachmentRecall, recalledItems] = await Promise.all([
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
              tokens: results.reduce((total, result) => total + (result.tokens ?? 0), 0),
            }))
          : Promise.resolve({
              context: "",
              items: [],
              tokens: 0,
            }),
        knowledgeConfig.ids.length
          ? Promise.all(
              recallQueries.map(async (query) => {
                const result = await this.knowledgeService.recallForAppWithUsage({
                  knowledgeIds: knowledgeConfig.ids,
                  settings: knowledgeConfig.settings,
                  query,
                  userId,
                });
                tokenUsage.add(result.tokens);

                return result.items.map((item) => ({ ...item, query }));
              }),
            ).then((items) => items.flat())
          : Promise.resolve([] as KnowledgeRecallItemWithQuery[]),
      ]);
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

      const { agent } = await this.aiRuntimeService.createAgentFromDraft(
        draft,
        model,
        userId,
        {
          longTermMemoryContext,
          sessionSummaryContext,
          knowledgeContext,
          currentAttachmentContext: currentAttachmentContext.context,
          recalledAttachmentContext: historicalAttachmentRecall.context,
        },
      );
      const messages = this.createMessages(content, history);

      const run = await agent.streamEvents({ messages }, { version: "v3" });

      for await (const item of run.messages) {
        for await (const content of item.text) {
          output += content;
          yield this.sse({ content });
        }
      }
      const result = await run.output;
      tokenUsage.add(this.getTotalTokens(result.messages));

      if (draft.config.toggles?.questionSuggestions) {
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
          status: CHAT_MESSAGE_STATUS.FAILED,
          updatedBy: userId,
        });
      }
      yield this.sse({ message }, "error");
    }
  }
}
