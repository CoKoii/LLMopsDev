import { AIMessage, type BaseMessageLike } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Readable } from "node:stream";
import { z } from "zod";
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
const QuestionSuggestionsSchema = z
  .object({
    suggestions: z.array(z.string().min(1)).length(3),
  })
  .strict();

type SseEvent =
  | { content: string }
  | { message: string }
  | { elapsedMs: number; tokens?: number }
  | { items: string[] };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly aiRuntimeService: AiRuntimeService) {}

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

  async optimizePrompt(appId: number, prompt: string) {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt) {
      throw new BadRequestException("人设与回复逻辑不能为空");
    }

    const draft = await this.aiRuntimeService.getDraft(appId);
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

  createPromptOptimizeSseStream(appId: number, prompt: string): Readable {
    return Readable.from(this.streamPromptOptimize(appId, prompt));
  }

  private async *streamPromptOptimize(
    appId: number,
    prompt: string,
  ): AsyncGenerator<string> {
    const sourcePrompt = prompt.trim();

    try {
      if (!sourcePrompt) {
        throw new BadRequestException("人设与回复逻辑不能为空");
      }

      const draft = await this.aiRuntimeService.getDraft(appId);
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
      const { agent, draft } = await this.aiRuntimeService.createAgent(
        appId,
        userId,
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
