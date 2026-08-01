import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createAgent, toolCallLimitMiddleware } from "langchain";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Readable } from "stream";
import { Repository } from "typeorm";
import { AiAppCategory } from "../app/entities/app-category.entity";
import { Knowledge } from "../knowledge/entities/knowledge.entity";
import { Llm, LlmUsageType } from "../llm/entities/llm.entity";
import { LlmService } from "../llm/llm.service";
import { PluginCategory } from "../plugin/entities/plugin-category.entity";
import { Plugin } from "../plugin/entities/plugin.entity";
import { CreateHomeBuilderPlanDto } from "./dto/create-home-builder-plan.dto";
import { HomeBuilderToolFactory } from "./home-builder-tool.factory";
import type {
  HomeBuilderCatalogContext,
  HomeBuilderCreatedResource,
  HomeBuilderToolResult,
} from "./home-builder.types";

type HomeBuilderSseEvent =
  | { content: string }
  | { status: string }
  | { created: HomeBuilderCreatedResource }
  | { message: string };

const SSE_DONE = "data: [DONE]\n\n";

const HOME_BUILDER_SYSTEM_PROMPT = [
  "你是 LLMOps 首页的对话式构建助手，帮助用户创建 AI 应用或插件。",
  "每轮先调用资源目录工具，了解当前可用的真实资源。",
  "需求宽泛时，调用需求询问工具，每轮只问最多三个最影响核心效果的问题，并结合已知信息给出有用建议。",
  "信息足够时直接调用创建工具，不展示草案，也不要求确认。用户明确要求直接创建时，合理补全非关键细节。",
  "名称、开场白和常规模型参数由你合理决定，不为这些细节反复提问。",
  "模型、分类、插件和知识库只能使用资源目录中的 id；没有合适资源就不选。",
  "只有用户提供了足够完整、真实的接口资料时才能创建插件，绝不虚构接口、地址或参数。",
  "普通交流直接回复。除资源目录工具外，每轮最多调用一个需求询问或创建工具。",
  "根据工具的真实结果自然回复用户，不暴露内部工具和结构化数据。",
].join("\n");

const TOOL_STATUSES: Record<string, string> = {
  home_builder_catalog: "正在匹配可用资源",
  home_builder_ask_requirements: "正在整理需要了解的信息",
  home_builder_create_app: "正在创建 AI 应用",
  home_builder_create_plugin: "正在创建插件",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

@Injectable()
export class HomeBuilderService {
  private readonly logger = new Logger(HomeBuilderService.name);

  constructor(
    @InjectRepository(AiAppCategory)
    private readonly appCategoryRepository: Repository<AiAppCategory>,
    @InjectRepository(PluginCategory)
    private readonly pluginCategoryRepository: Repository<PluginCategory>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly llmService: LlmService,
    private readonly toolFactory: HomeBuilderToolFactory,
  ) {}

  createPlanSseStream(dto: CreateHomeBuilderPlanDto, userId: number): Readable {
    return Readable.from(this.streamHomeBuilder(dto, userId));
  }

  private async *streamHomeBuilder(
    dto: CreateHomeBuilderPlanDto,
    userId: number,
  ): AsyncGenerator<string> {
    try {
      yield this.sse({ status: "正在读取可用资源" }, "status");
      const context = await this.loadCatalogContext(userId);
      const model = await this.llmService.createDefaultChatModel(
        LlmUsageType.CHAT,
        { temperature: 0.2, maxRetries: 1 },
      );
      const agent = createAgent({
        model,
        tools: this.toolFactory.create(context, userId),
        systemPrompt: HOME_BUILDER_SYSTEM_PROMPT,
        middleware: [
          toolCallLimitMiddleware({
            toolName: "home_builder_create_app",
            runLimit: 1,
          }),
          toolCallLimitMiddleware({
            toolName: "home_builder_create_plugin",
            runLimit: 1,
          }),
        ],
      });
      const messages = (dto.history ?? [])
        .slice(-12)
        .map((message) =>
          message.role === "user"
            ? new HumanMessage(message.content)
            : new AIMessage(message.content),
        );
      messages.push(new HumanMessage(dto.message));

      yield this.sse({ status: "正在分析你的需求" }, "status");
      const events = agent.streamEvents(
        { messages },
        { version: "v2", recursionLimit: 12 },
      );
      let createdResource: HomeBuilderCreatedResource | undefined;

      for await (const event of events) {
        if (event.event === "on_tool_start") {
          const status = TOOL_STATUSES[event.name];
          if (status) yield this.sse({ status }, "status");
          continue;
        }

        if (event.event === "on_tool_end") {
          const result = this.parseToolResult(event.data.output);
          if (result?.kind === "created" && !createdResource) {
            createdResource = result.resource;
            yield this.sse({ created: result.resource }, "created");
          }
          if (result) {
            yield this.sse({ status: "正在生成回复" }, "status");
          }
          continue;
        }

        if (event.event === "on_chat_model_stream") {
          const chunk = event.data.chunk as unknown;
          const content = this.getMessageText(
            isObject(chunk) ? chunk.content : undefined,
          );
          if (content) yield this.sse({ content }, "content");
        }
      }

      yield SSE_DONE;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `home-builder failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      yield this.sse({ message }, "error");
      yield SSE_DONE;
    }
  }

  private sse(data: HomeBuilderSseEvent, event?: string) {
    const prefix = event ? `event: ${event}\n` : "";
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private async loadCatalogContext(
    userId: number,
  ): Promise<HomeBuilderCatalogContext> {
    const [
      appCategories,
      pluginCategories,
      chatModels,
      availablePlugins,
      ownedPlugins,
      ownedKnowledge,
    ] = await Promise.all([
      this.appCategoryRepository.find({ order: { sort: "ASC", id: "ASC" } }),
      this.pluginCategoryRepository.find({ order: { sort: "ASC", id: "ASC" } }),
      this.llmRepository.find({
        select: ["id", "modelName", "isDefault"],
        where: { usageType: LlmUsageType.CHAT, enabled: true },
        order: { isDefault: "DESC", id: "ASC" },
      }),
      this.pluginRepository.find({
        where: { published: true, status: true },
        relations: { category: true },
        order: { id: "DESC" },
        take: 80,
      }),
      this.pluginRepository.find({
        where: { createdBy: userId, status: true },
        relations: { category: true },
        order: { id: "DESC" },
        take: 80,
      }),
      this.knowledgeRepository.find({
        where: { createdBy: userId, status: true },
        order: { id: "DESC" },
        take: 80,
      }),
    ]);

    return {
      appCategories,
      pluginCategories,
      chatModels,
      availablePlugins,
      ownedPlugins,
      ownedKnowledge,
    };
  }

  private parseToolResult(output: unknown): HomeBuilderToolResult | undefined {
    const content = isObject(output) ? output.content : output;
    const text = this.getMessageText(content);
    if (!text) return undefined;

    try {
      const result: unknown = JSON.parse(text);
      if (!isObject(result)) return undefined;
      if (result.kind === "catalog") {
        return { kind: "catalog", resources: result.resources };
      }
      if (
        result.kind === "needs_input" &&
        Array.isArray(result.questions) &&
        result.questions.every((item) => typeof item === "string")
      ) {
        return { kind: "needs_input", questions: result.questions };
      }
      if (
        result.kind === "created" &&
        this.isCreatedResource(result.resource)
      ) {
        return { kind: "created", resource: result.resource };
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private isCreatedResource(
    value: unknown,
  ): value is HomeBuilderCreatedResource {
    if (!isObject(value) || typeof value.name !== "string") return false;
    return (
      (value.type === "app" && typeof value.id === "number") ||
      value.type === "plugin"
    );
  }

  private getMessageText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isObject(item) && typeof item.text === "string") return item.text;
        return "";
      })
      .join("");
  }
}
