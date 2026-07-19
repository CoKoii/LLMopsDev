import { type BaseMessageLike } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Readable } from "node:stream";
import { Repository } from "typeorm";
import {
  AiAppVersion,
  AiAppVersionStatus,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import { Llm } from "../llm/entities/llm.entity";
import { PluginToolService } from "../plugin/plugin-tool.service";
import { type DebugAppChatHistoryDto } from "./dto/debug-app-chat.dto";

const DRAFT_VERSION = "draft";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    private readonly pluginToolService: PluginToolService,
  ) {}

  private async getDraft(appId: number): Promise<AiAppVersion> {
    const app = await this.appRepository.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException("AI应用不存在");

    const draft = await this.appVersionRepository.findOne({
      where: {
        appId,
        version: DRAFT_VERSION,
        status: AiAppVersionStatus.DRAFT,
      },
    });
    if (!draft) throw new NotFoundException("AI应用草稿不存在");

    return draft;
  }

  private async getConfiguredLlm(config: AiAppVersionConfig): Promise<Llm> {
    if (!config.llmId) {
      throw new BadRequestException("请先选择模型");
    }

    const llm = await this.llmRepository.findOne({
      where: { id: config.llmId },
    });
    if (!llm) throw new BadRequestException("模型不存在");

    return llm;
  }

  private createModel(llm: Llm, config: AiAppVersionConfig): ChatOpenAI {
    const settings = config.modelSettings ?? {};

    return new ChatOpenAI({
      apiKey: llm.apiKey,
      model: llm.modelName,
      maxRetries: 1,
      streamUsage: true,
      temperature: settings.temperature,
      topP: settings.topP,
      frequencyPenalty: settings.frequencyPenalty,
      presencePenalty: settings.presencePenalty,
      configuration: { baseURL: llm.url },
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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
      [
        "system",
        [
          "只返回 JSON 字符串数组，包含 3 条用户下一步可能直接发送的话。",
          "必须用用户本人语气，如“帮我…”“我想…”“能不能…”“请继续…”。",
          "不要用旁观口吻，如“你可以问…”“是否需要…”“建议询问…”。",
          "每条简短自然，可直接点击发送。",
        ].join("\n"),
      ],
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
      [
        "system",
        [
          "润色用户提供的人设与回复逻辑，使表达更清晰、通顺、自然。",
          "只调整措辞和逻辑顺序，保留原意、角色、约束和信息量。",
          "不要新增角色、任务、规则、示例或业务设定；不要扩写。",
          "输出长度接近原文，最多不超过原文 1.2 倍；原文很短则保持同等长度。",
          "保留原有 Markdown 结构；无结构时不要强行添加复杂结构。",
          "只返回润色后的正文，不解释，不使用代码块。",
        ].join("\n"),
      ],
      ["human", `请润色下面的人设与回复逻辑，不要扩写：\n\n${sourcePrompt}`],
    ];
  }

  private contentToText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";

    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!this.isRecord(item)) return "";
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        return "";
      })
      .join("");
  }

  private hasMessageTypeGetter(
    value: unknown,
  ): value is { _getType: () => string } {
    return (
      typeof value === "object" &&
      value !== null &&
      "_getType" in value &&
      typeof value._getType === "function"
    );
  }

  private getLastAssistantText(messages: unknown) {
    if (!Array.isArray(messages)) return "";

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item: unknown = messages[index];
      if (!this.isRecord(item)) continue;
      const id = this.isRecord(item.id) ? item.id : undefined;
      const role =
        typeof item.role === "string"
          ? item.role
          : this.hasMessageTypeGetter(item)
            ? item._getType()
            : typeof id?.[2] === "string"
              ? id[2]
              : undefined;
      if (role !== "ai" && role !== "assistant" && role !== "AIMessage") {
        continue;
      }

      return this.contentToText(item.content);
    }

    return "";
  }

  async optimizePrompt(appId: number, prompt: string) {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt) {
      throw new BadRequestException("人设与回复逻辑不能为空");
    }

    const draft = await this.getDraft(appId);
    const llm = await this.getConfiguredLlm(draft.config);
    const model = this.createModel(llm, draft.config);
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

      const draft = await this.getDraft(appId);
      const llm = await this.getConfiguredLlm(draft.config);
      const model = this.createModel(llm, draft.config);
      const stream = await model.stream(
        this.createPromptOptimizeMessages(sourcePrompt),
      );

      for await (const chunk of stream) {
        if (chunk.text) {
          yield `data: ${JSON.stringify({ content: chunk.text })}\n\n`;
        }
      }

      yield "data: [DONE]\n\n";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Prompt优化失败: ${message}`, stack);
      yield `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
    }
  }

  createAppDebugSseStream(
    appId: number,
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ): Readable {
    return Readable.from(this.streamAppDebug(appId, message, history));
  }

  private async *streamAppDebug(
    appId: number,
    message: string,
    history: DebugAppChatHistoryDto[] = [],
  ): AsyncGenerator<string> {
    const startedAt = Date.now();
    let output = "";

    try {
      const draft = await this.getDraft(appId);
      const llm = await this.getConfiguredLlm(draft.config);
      const model = this.createModel(llm, draft.config);
      const messages = this.createMessages(message, history);
      const tools = await this.pluginToolService.loadEnabledTools(draft.config);

      const agent = createAgent({
        model,
        tools,
        systemPrompt: draft.config.prompt?.trim() || undefined,
      });
      const result = await agent.invoke({ messages });
      output = this.getLastAssistantText(result.messages);
      if (output) {
        yield `data: ${JSON.stringify({ content: output })}\n\n`;
      }

      yield `event: meta\ndata: ${JSON.stringify({
        elapsedMs: Date.now() - startedAt,
      })}\n\n`;

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
        yield `event: suggestions\ndata: ${JSON.stringify({ items: suggestions })}\n\n`;
      }

      yield "data: [DONE]\n\n";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`AI应用调试失败: ${message}`, stack);
      yield `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
    }
  }
}
