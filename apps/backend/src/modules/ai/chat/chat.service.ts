import { AIMessage, type BaseMessageLike } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Readable } from "node:stream";
import { z } from "zod";
import {
  type AppKnowledgeRecallItem,
  KnowledgeService,
} from "../knowledge/knowledge.service";
import {
  type AiAppKnowledgeRecallSettings,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { AiRuntimeService } from "./ai-runtime.service";
import { type DebugAppChatHistoryDto } from "./dto/debug-app-chat.dto";

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
const LOCAL_STRUCTURED_OUTPUT_MODEL = "qwen2.5:0.5b";
const LOCAL_STRUCTURED_OUTPUT_BASE_URL = "http://localhost:11434/v1";
const KNOWLEDGE_QUERY_REWRITE_SYSTEM_PROMPT = [
  "你负责将用户问题改写成用于知识库检索的问题。",
  "请遵循以下规则：",
  "- 不回答问题。",
  "- 不增加历史中不存在的信息。",
  "- 不猜测用户意图。",
  "- 如果存在代词（它、这个、那里、前面的接口等），必须根据聊天记录替换成明确对象。",
  "- 如果问题已经完整，不做修改。",
  "- 只生成一句检索问题。",
  "示例：",
  "用户：登录接口路径是什么",
  "LLM：登录接口路径是 POST /api/auth/login。",
  "用户：它成功后返回什么",
  "检索问题：登录接口成功后返回什么",
].join("\n");
const QuestionSuggestionsSchema = z
  .object({
    suggestions: z.array(z.string().min(1)).length(3),
  })
  .strict();
const KnowledgeQueryRewriteSchema = z
  .object({
    query: z.string().min(1),
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
  | { elapsedMs: number; tokens?: number }
  | { items: string[] }
  | KnowledgeCitationEvent;

type KnowledgeCitation = {
  id: number;
  query: string;
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
type KnowledgeRecallItemWithQuery = AppKnowledgeRecallItem & {
  query: string;
};
type KnowledgeConfig = {
  ids: number[];
  settings: AiAppKnowledgeRecallSettings;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiRuntimeService: AiRuntimeService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  private sse(data: SseEvent, event?: string) {
    const prefix = event ? `event: ${event}\n` : "";
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private createMessages(
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ) {
    const messages: BaseMessageLike[] = [];
    for (const item of history) {
      const content = item.content.trim();
      if (!content) continue;
      messages.push([item.role === "assistant" ? "ai" : "human", content]);
    }
    messages.push(["human", message]);

    return messages;
  }

  private compactText(value: string, maxLength: number) {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  private createKnowledgeQueryRewriteMessages(
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ): BaseMessageLike[] {
    const messages: BaseMessageLike[] = [
      ["system", KNOWLEDGE_QUERY_REWRITE_SYSTEM_PROMPT],
    ];

    for (const item of history.slice(-8)) {
      const content = this.compactText(item.content, 500);
      if (!content) continue;
      messages.push([ ages.pu
    return messages;
  }

  private async rewriteKnowledgeQuery(
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ) {
    const fallback = message.trim();
    if (!fallback) return "";

    try {
      const model = new ChatOpenAI({
        apiKey: "ollama",
        model: LOCAL_STRUCTURED_OUTPUT_MODEL,
        maxRetries: 0,
        temperature: 0,
        configuration: { baseURL: LOCAL_STRUCTURED_OUTPUT_BASE_URL },
      });
      const structuredModel = model.withStructuredOutput(
        KnowledgeQueryRewriteSchema,
        {
          name: "KnowledgeQueryRewrite",
        },
      );
      const response = await structuredModel.invoke(
        this.createKnowledgeQueryRewriteMessages(fallback, history),
      );
      const query = response.query.trim() || fallback;

      this.logger.log(
        `知识库检索问题改写完成: message="${this.compactText(fallback, 120)}", history=${history.length}, query="${this.compactText(query, 120)}"`,
      );

      return query;
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      this.logger.warn(`知识库检索问题改写失败，使用原问题检索: ${warning}`);
      return fallback;
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
      if (!itemMap.has(chunkKey)) itemMap.set(chunkKey, item);
    }

    return [...itemMap.values()];
  }

  private compressKnowledgeContext(
    items: KnowledgeRecallItemWithQuery[],
    itemLimit = 5,
  ) {
    const maxItems = Math.max(6, itemLimit);
    const maxItemChars = 900;
    const maxTotalChars = 5000;
    const citations: KnowledgeCitation[] = [];
    const contextParts: string[] = [];
    let totalChars = 0;
    const uniqueItems = this.dedupeKnowledgeRecallItems(items);

    for (const item of uniqueItems) {
      if (citations.length >= maxItems) break;

      const text = this.compactText(item.text, maxItemChars);
      if (!text || totalChars + text.length > maxTotalChars) break;

      const citationId = citations.length + 1;
      citations.push({
        id: citationId,
        query: item.query,
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
          item.query ? `检索问题：${item.query}` : undefined,
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
  ): Promise<string[]> {
    const model = new ChatOpenAI({
      apiKey: "ollama",
      model: LOCAL_STRUCTURED_OUTPUT_MODEL,
      maxRetries: 0,
      temperature: 1.5,
      configuration: { baseURL: LOCAL_STRUCTURED_OUTPUT_BASE_URL },
    });
    const structuredModel = model.withStructuredOutput(
      QuestionSuggestionsSchema,
      {
        name: "QuestionSuggestions",
      },
    );
    const response = await structuredModel.invoke([
      ["system", QUESTION_SUGGESTION_SYSTEM_PROMPT],
      ["human", `用户刚才说：${userMessage}\nAI刚才回复：${assistantMessage}`],
    ]);

    return response.suggestions;
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
    const tokens = messages
      .filter((message) => AIMessage.isInstance(message))
      .reduce(
        (total, message) => total + (message.usage_metadata?.total_tokens ?? 0),
        0,
      );

    return tokens || undefined;
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
    history: DebugAppChatHistoryDto[] = [],
  ): Readable {
    return Readable.from(this.streamAppDebug(appId, message, userId, history));
  }

  private async *streamAppDebug(
    appId: number,
    message: string,
    userId: number,
    history: DebugAppChatHistoryDto[] = [],
  ): AsyncGenerator<string> {
    const startedAt = Date.now();
    let output = "";

    try {
      const draft = await this.aiRuntimeService.getDraft(appId, userId);
      const model = await this.aiRuntimeService.createModel(draft.config);
      const knowledgeConfig = this.resolveKnowledgeConfig(draft.config);
      const knowledgeQuery = knowledgeConfig.ids.length
        ? await this.rewriteKnowledgeQuery(message, history)
        : message.trim();
      const recalledItems: KnowledgeRecallItemWithQuery[] = knowledgeConfig.ids
        .length
        ? (
            await this.knowledgeService.recallForApp({
              knowledgeIds: knowledgeConfig.ids,
              settings: knowledgeConfig.settings,
              query: knowledgeQuery,
              userId,
            })
          ).map((item) => ({ ...item, query: knowledgeQuery }))
        : [];
      const contextItemLimit =
        this.resolveKnowledgeContextItemLimit(knowledgeConfig);
      const { context: knowledgeContext, citations } =
        this.compressKnowledgeContext(recalledItems, contextItemLimit);

      if (citations.length) {
        yield this.sse(
          {
            query: knowledgeQuery,
            items: citations,
          },
          "knowledge",
        );
      }

      const { agent } = await this.aiRuntimeService.createAgentFromDraft(
        draft,
        model,
        userId,
        { knowledgeContext },
      );
      const messages = this.createMessages(message, history);

      const run = await agent.streamEvents({ messages }, { version: "v3" });

      for await (const item of run.messages) {
        for await (const content of item.text) {
          output += content;
          yield this.sse({ content });
        }
      }
      const result = await run.output;
      const tokens = this.getTotalTokens(result.messages);

      yield this.sse(
        {
          elapsedMs: Date.now() - startedAt,
          tokens,
        },
        "meta",
      );

      if (draft.config.toggles?.questionSuggestions) {
        let suggestions: string[] = [];
        try {
          suggestions = await this.createQuestionSuggestions(message, output);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;

          this.logger.warn(`用户问题建议生成失败: ${message}`, stack);
        }
        yield this.sse({ items: suggestions }, "suggestions");
      }

      yield SSE_DONE;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`AI应用调试失败: ${message}`, stack);
      yield this.sse({ message }, "error");
    }
  }
}
