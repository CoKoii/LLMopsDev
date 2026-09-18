import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Readable } from "stream";
import { Repository } from "typeorm";
import { createAiTrace } from "../../../common/trace/ai-trace";
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
  "不要询问模型、分类、温度等实现细节；默认配置由你决定。围绕目标用户、使用方式、输入、输出和业务约束提问。",
  "先理解用户目标。信息不足时，直接用中文流式询问最多三个最关键的问题，不调用工具，不展示草案，也不要求确认。",
  "当前可用资源目录会随请求提供给你。信息足够时直接调用合适的创建工具；信息不足时直接回复并提问，不调用工具。",
  "模型、分类、插件和知识库只能使用资源目录中的真实 id；没有合适资源就留空。",
  "名称、开场白和常规模型参数由你合理决定，不为非关键细节反复提问。",
  "只有用户提供了足够完整真实的接口资料时才能创建插件，绝不虚构接口、地址或参数。",
  "调用创建工具时，在 completionMessage 中写好创建成功后给用户的简洁自然回复。普通交流直接回复。",
].join("\n");

const TOOL_STATUSES: Record<string, string> = {
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

  createPlanSseStream(
    dto: CreateHomeBuilderPlanDto,
    userId: number,
    signal?: AbortSignal,
  ): Readable {
    return Readable.from(this.streamHomeBuilder(dto, userId, signal));
  }

  private async *streamHomeBuilder(
    dto: CreateHomeBuilderPlanDto,
    userId: number,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const trace = createAiTrace("home-builder", { userId });
    let outputLength = 0;

    try {
      yield this.sse({ status: "正在读取可用资源" }, "status");
      const context = await trace.step("load-catalog", () =>
        this.loadCatalogContext(userId),
      );
      const model = await trace.step("create-model", () =>
        this.llmService.createDefaultChatModel(LlmUsageType.BUILT_IN_LARGE, {
          temperature: 0.2,
          maxRetries: 1,
        }),
      );
      const tools = this.toolFactory.create(context, userId);
      const agent = await trace.step("create-agent", () =>
        createAgent({
          model,
          tools,
          systemPrompt: `${HOME_BUILDER_SYSTEM_PROMPT}\n可用资源目录：${JSON.stringify(
            this.toolFactory.describeResources(context),
          )}`,
        }),
      );
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
        { version: "v2", recursionLimit: 12, signal },
      );
      for await (const event of events) {
        if (signal?.aborted) {
          trace.end({ status: "stopped", outputLength });
          return;
        }
        if (event.event === "on_tool_start") {
          trace.mark("tool.start", { tool: event.name });
          const status = TOOL_STATUSES[event.name];
          if (status) yield this.sse({ status }, "status");
          continue;
        }

        if (event.event === "on_tool_end") {
          trace.mark("tool.complete", { tool: event.name });
          const result = this.parseToolResult(event.data.output);
          if (result?.kind === "created") {
            yield this.sse({ created: result.resource }, "created");
            yield this.sse({ content: result.reply }, "content");
            outputLength += result.reply.length;
            break;
          }
          continue;
        }

        if (event.event === "on_chat_model_stream") {
          const chunk = event.data.chunk as unknown;
          const content = this.getMessageText(
            isObject(chunk) ? chunk.content : undefined,
          );
          if (content) {
            outputLength += content.length;
            yield this.sse({ content }, "content");
          }
        }
      }

      trace.end({ status: "completed", outputLength });
      yield SSE_DONE;
    } catch (error) {
      if (signal?.aborted) {
        trace.end({ status: "stopped", outputLength });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      trace.mark("failed", { error: message });
      trace.end({ status: "failed", outputLength });
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
    return this.findToolResult(output, new Set(), 0);
  }

  private findToolResult(
    value: unknown,
    visited: Set<object>,
    depth: number,
  ): HomeBuilderToolResult | undefined {
    if (depth > 6) return undefined;
    if (typeof value === "string") {
      try {
        return this.findToolResult(JSON.parse(value), visited, depth + 1);
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = this.findToolResult(item, visited, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    if (!isObject(value) || visited.has(value)) return undefined;
    visited.add(value);

    if (
      value.kind === "created" &&
      this.isCreatedResource(value.resource) &&
      typeof value.reply === "string" &&
      value.reply.trim()
    ) {
      return {
        kind: "created",
        resource: value.resource,
        reply: value.reply.trim(),
      };
    }

    for (const child of Object.values(value)) {
      const result = this.findToolResult(child, visited, depth + 1);
      if (result) return result;
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
