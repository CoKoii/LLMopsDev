import { AIMessage, type BaseMessageLike } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Readable } from "node:stream";
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
  "只返回 JSON 字符串数组，包含 3 条用户下一步可能直接发送的话。",
  "必须用用户本人语气，如“帮我…”“我想…”“能不能…”“请继续…”。",
  "不要用旁观口吻，如“你可以问…”“是否需要…”“建议询问…”。",
  "每条简短自然，可直接点击发送。",
].join("\n");

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

  private parseSuggestions(content: string): string[] {
    const matched = /\[[\s\S]*\]/.exec(content);
    if (!matched) return [];

    try {
      const parsed: unknown = JSON.parse(matched[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  private async createQuestionSuggestions(
    model: ChatOpenAI,
    userMessage: string,
    assistantMessage: string,
  ): Promise<string[]> {
    const response = await model.invoke([
      ["system", QUESTION_SUGGESTION_SYSTEM_PROMPT],
      [
        "human",
        `用户消息：${userMessage}\nAI回复：${assistantMessage}\n生成 3 条后续发送建议。`,
      ],
    ]);

    return this.parseSuggestions(response.text);
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
      const { agent, draft, model } = await this.aiRuntimeService.createAgent(
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
          suggestions = await this.createQuestionSuggestions(
            model,
            message,
            output,
          );
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
