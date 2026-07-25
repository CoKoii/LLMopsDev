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
  "输出长度接近原文，最多不超过原文 1.2 倍；原文很短则保持同等长度。",
  "保留原有 Markdown 结构；无结构时不要强行添加复杂结构。",
  "只返回润色后的正文，不解释，不使用代码块。",
].join("\n");
const QUESTION_SUGGESTION_SYSTEM_PROMPT = [
  "生成聊天输入框下方的快捷提问按钮。",
  "内容要像用户下一步会直接发送的话。",
  "优先生成具体、可点击的短命令。",
].join("\n");
const QUESTION_SUGGESTION_MODEL = "qwen2.5:0.5b";
const QUESTION_SUGGESTION_BASE_URL = "http://localhost:11434/v1";
const KNOWLEDGE_QUERY_PLAN_MODEL = QUESTION_SUGGESTION_MODEL;
const KNOWLEDGE_QUERY_PLAN_BASE_URL = QUESTION_SUGGESTION_BASE_URL;
const KNOWLEDGE_QUERY_PLAN_SYSTEM_PROMPT = [
  "你负责把用户问题规划成适合知识库检索的独立检索问题。",
  "结合最近聊天历史补全省略的主语、对象和约束。",
  "如果用户同时问多个问题，拆成多个独立检索问题。",
  "如果用户只问一个问题，只返回一个检索问题。",
  "不回答问题，不解释。",
].join("\n");
const QuestionSuggestionsSchema = z
  .object({
    suggestions: z.array(z.string().min(1)).length(3),
  })
  .strict();
const KnowledgeQueryPlanSchema = z
  .object({
    queries: z.array(z.string().min(1)).min(1),
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
  query?: string;
  queries?: string[];
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
  query?: string;
  queries?: string[];
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

  private createKnowledgeQueryPlanMessages(
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ): Array<["system" | "human", string]> {
    const historyText = history
      .slice(-8)
      .map((item) => {
        const role = item.role === "assistant" ? "AI" : "用户";
        return `${role}: ${this.compactText(item.content, 500)}`;
      })
      .join("\n");

    return [
      ["system", KNOWLEDGE_QUERY_PLAN_SYSTEM_PROMPT],
      [
        "human",
        [
          historyText ? `最近聊天历史：\n${historyText}` : "",
          `当前用户问题：${message}`,
          '请输出 JSON：{"queries":["检索问题1"]}',
        ]
          .filter(Boolean)
          .join("\n\n"),
      ],
    ];
  }

  private normalizeKnowledgeQueries(queries: string[], fallback: string) {
    const normalizedQueries = [
      ...new Set(queries.map((item) => item.trim()).filter(Boolean)),
    ];

    return normalizedQueries.length ? normalizedQueries : [fallback];
  }

  private async planKnowledgeQueries(
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ) {
    const fallback = message.trim();
    if (!fallback) return [];

    try {
      const model = new ChatOpenAI({
        apiKey: "ollama",
        model: KNOWLEDGE_QUERY_PLAN_MODEL,
        maxRetries: 0,
        temperature: 0,
        configuration: { baseURL: KNOWLEDGE_QUERY_PLAN_BASE_URL },
      });
      const structuredModel = model.withStructuredOutput(
        KnowledgeQueryPlanSchema,
        {
          name: "KnowledgeQueryPlan",
          method: "jsonSchema",
          strict: true,
        },
      );
      const response = await structuredModel.invoke(
        this.createKnowledgeQueryPlanMessages(fallback, history),
      );

      return this.normalizeKnowledgeQueries(response.queries, fallback);
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      this.logger.warn(`知识库检索问题规划失败: ${warning}`);
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

  private orderKnowledgeItemsForCompression(
    items: KnowledgeRecallItemWithQuery[],
  ) {
    const groups = new Map<string, KnowledgeRecallItemWithQuery[]>();

    for (const item of items) {
      const key = item.query || "";
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
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

  private dedupeKnowledgeRecallItems(items: KnowledgeRecallItemWithQuery[]) {
    const itemMap = new Map<string, KnowledgeRecallItemWithQuery>();

    for (const item of items) {
      const chunkKey = `${item.knowledgeId}:${item.chunkId}`;
      const existingItem = itemMap.get(chunkKey);
      if (!existingItem) {
        itemMap.set(chunkKey, {
          ...item,
          queries: item.query ? [item.query] : [],
        });
        continue;
      }

      if (item.query && !existingItem.queries?.includes(item.query)) {
        existingItem.queries = [...(existingItem.queries ?? []), item.query];
      }
    }

    return [...itemMap.values()];
  }

  private compressKnowledgeContext(
    items: KnowledgeRecallItemWithQuery[],
    itemLimitPerQuery = 5,
  ) {
    const queryCount = new Set(items.map((item) => item.query).filter(Boolean))
      .size;
    const maxItems = Math.max(6, (queryCount || 1) * itemLimitPerQuery);
    const maxItemChars = 900;
    const maxTotalChars = Math.max(5000, (queryCount || 1) * 3500);
    const citations: KnowledgeCitation[] = [];
    const contextParts: string[] = [];
    let totalChars = 0;
    const uniqueItems = this.dedupeKnowledgeRecallItems(items);

    for (const item of this.orderKnowledgeItemsForCompression(uniqueItems)) {
      if (citations.length >= maxItems) break;

      const text = this.compactText(item.text, maxItemChars);
      if (!text || totalChars + text.length > maxTotalChars) break;

      const citationId = citations.length + 1;
      citations.push({
        id: citationId,
        query: item.query,
        queries: item.queries,
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
      model: QUESTION_SUGGESTION_MODEL,
      maxRetries: 0,
      temperature: 1.5,
      configuration: { baseURL: QUESTION_SUGGESTION_BASE_URL },
    });
    const structuredModel = model.withStructuredOutput(
      QuestionSuggestionsSchema,
      {
        name: "QuestionSuggestions",
        method: "jsonSchema",
        strict: true,
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
    const response = await model.invoke(
      this.createPromptOptimizeMessages(sourcePrompt),
    );

    const optimizedPrompt = response.text.trim();
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
      const stream = await model.stream(
        this.createPromptOptimizeMessages(sourcePrompt),
      );

      for await (const chunk of stream) {
        if (chunk.text) {
          yield this.sse({ content: chunk.text });
        }
      }

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
      const queryPlans = knowledgeConfig.ids.length
        ? await this.planKnowledgeQueries(message, history)
        : [message.trim()];
      const recalledItems = (
        await Promise.all(
          queryPlans.map(async (query) => {
            const items = await this.knowledgeService.recallForApp({
              knowledgeIds: knowledgeConfig.ids,
              settings: knowledgeConfig.settings,
              query,
              userId,
            });

            return items.map((item) => ({ ...item, query }));
          }),
        )
      ).flat();
      const contextItemLimit =
        this.resolveKnowledgeContextItemLimit(knowledgeConfig);
      const { context: knowledgeContext, citations } =
        this.compressKnowledgeContext(recalledItems, contextItemLimit);

      if (citations.length) {
        yield this.sse(
          {
            query: queryPlans.join("；"),
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
