import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Readable } from "stream";
import { Repository } from "typeorm";
import { z } from "zod";
import { AiAppCategory } from "../app/entities/app-category.entity";
import { Knowledge } from "../knowledge/entities/knowledge.entity";
import { Llm, LlmUsageType } from "../llm/entities/llm.entity";
import { LlmService } from "../llm/llm.service";
import { PluginCategory } from "../plugin/entities/plugin-category.entity";
import { Plugin } from "../plugin/entities/plugin.entity";
import { CreateHomeBuilderPlanDto } from "./dto/create-home-builder-plan.dto";

type CatalogContext = {
  appCategories: AiAppCategory[];
  pluginCategories: PluginCategory[];
  chatModels: Pick<Llm, "id" | "modelName" | "isDefault">[];
  availablePlugins: Plugin[];
  ownedPlugins: Plugin[];
  ownedKnowledge: Knowledge[];
};

const BuilderPlanSchema = z
  .object({
    intent: z.enum(["create_app", "create_plugin", "answer", "clarify"]),
    action: z.enum(["draft", "create", "answer", "clarify"]).default("draft"),
    reply: z.string().min(1),
    reasoning: z.array(z.string()).default([]),
    app: z
      .object({
        name: z.string().min(1).max(100),
        description: z.string().max(800).default(""),
        categoryId: z.number().int().optional(),
        llmId: z.number().int().optional().nullable(),
        prompt: z.string().min(1),
        modelSettings: z
          .object({
            temperature: z.number().min(0).max(2).optional(),
            topP: z.number().min(0).max(1).optional(),
            presencePenalty: z.number().min(-2).max(2).optional(),
            frequencyPenalty: z.number().min(-2).max(2).optional(),
            contextRounds: z.number().int().min(1).max(30).optional(),
          })
          .default({}),
        pluginIds: z.array(z.number().int()).default([]),
        knowledgeIds: z.array(z.number().int()).default([]),
        toggles: z
          .object({
            longTermMemory: z.boolean().optional(),
            questionSuggestions: z.boolean().optional(),
            voiceInput: z.boolean().optional(),
            voiceOutput: z.boolean().optional(),
          })
          .default({}),
        openingStatement: z
          .object({
            content: z.string().default(""),
            questions: z.array(z.string()).default([]),
          })
          .default({ content: "", questions: [] }),
        capabilities: z
          .array(
            z.object({
              key: z.string().min(1),
              title: z.string().min(1),
              description: z.string().optional(),
              icon: z.string().optional(),
              tone: z.string().optional(),
            }),
          )
          .default([]),
      })
      .optional(),
    plugin: z
      .object({
        name: z.string().min(1).max(100),
        description: z.string().max(800).default(""),
        categoryId: z.number().int().optional(),
        openapiSchema: z.string().default(""),
        headers: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .default([]),
        published: z.boolean().default(false),
        needsMoreInfo: z.boolean().default(false),
      })
      .optional(),
    nextQuestions: z.array(z.string()).default([]),
  })
  .strict();

type BuilderPlan = z.infer<typeof BuilderPlanSchema>;
type NormalizedBuilderPlan = BuilderPlan & {
  context: {
    appCategories: AiAppCategory[];
    pluginCategories: PluginCategory[];
    chatModels: Pick<Llm, "id" | "modelName" | "isDefault">[];
    selectedPlugins: Plugin[];
    selectedKnowledge: Knowledge[];
  };
};
type HomeBuilderSseEvent =
  | { content: string }
  | { plan: NormalizedBuilderPlan }
  | { message: string };

const SSE_DONE = "data: [DONE]\n\n";
const HOME_BUILDER_SYSTEM_PROMPT = [
  "你是产品首页的对话式创建 agent，负责把用户想法落成可创建的 AI 应用或插件。",
  "先理解用户想达成的结果、使用场景、适用人群和边界；目标足够清楚时直接设计方案，不要追问配置开关。",
  "应用方案需要包含名称、描述、提示词、模型配置、开场白、建议问题，以及你判断必要的知识库、插件和长期记忆。",
  "插件方案只能基于用户提供的真实接口信息；接口信息不足时追问接口地址、方法、鉴权、参数和响应示例。",
  "模型、插件、知识库只能使用资源目录里的真实 id；没有合适资源就留空。",
  "reply 是用户唯一看到的回复，必须完整、简洁、可直接发送；draft 时概括方案和关键取舍，并让用户确认或说明调整目标。",
  "确认创建前方案只存在于对话上下文；当你判断应创建时，主动发起创建工具调用，不要在工具成功前声称已经创建完成。",
].join("\n");

const compact = (value?: string | null, limit = 220) => {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const uniqueById = <T extends { id: number }>(items: T[]) => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

@Injectable()
export class HomeBuilderService {
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
  ) {}

  async createPlan(dto: CreateHomeBuilderPlanDto, userId: number) {
    return this.createPlanResult(dto, userId);
  }

  createPlanSseStream(dto: CreateHomeBuilderPlanDto, userId: number): Readable {
    return Readable.from(this.streamPlan(dto, userId));
  }

  private async createPlanResult(
    dto: CreateHomeBuilderPlanDto,
    userId: number,
  ) {
    const context = await this.loadCatalogContext(userId);
    const pendingPlan = this.parsePendingPlan(dto.pendingPlan);
    const model = await this.llmService.createDefaultChatModel(
      LlmUsageType.STRUCTURED,
      {
        temperature: 0.25,
        maxRetries: 1,
      },
    );
    const structuredModel = model.withStructuredOutput(BuilderPlanSchema, {
      name: "HomeBuilderPlan",
    });
    const plan = await structuredModel.invoke([
      ["system", HOME_BUILDER_SYSTEM_PROMPT],
      [
        "human",
        [
          `用户当前消息：${dto.message}`,
          dto.history?.length
            ? `最近对话：${JSON.stringify(dto.history.slice(-8))}`
            : "",
          pendingPlan
            ? `待确认方案：${JSON.stringify(pendingPlan)}`
            : "当前没有待确认方案。",
          `资源目录：${JSON.stringify(this.createPromptCatalog(context))}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      ],
    ]);

    return this.normalizePlan(
      BuilderPlanSchema.parse(plan),
      context,
      pendingPlan,
    );
  }

  private async *streamPlan(
    dto: CreateHomeBuilderPlanDto,
    userId: number,
  ): AsyncGenerator<string> {
    try {
      yield ": connected\n\n";
      const plan = await this.createPlanResult(dto, userId);

      for await (const chunk of this.streamTextChunks(plan.reply)) {
        yield this.sse({ content: chunk });
      }

      yield this.sse({ plan }, "plan");
      yield SSE_DONE;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield this.sse({ message }, "error");
      yield SSE_DONE;
    }
  }

  private sse(data: HomeBuilderSseEvent, event?: string) {
    const prefix = event ? `event: ${event}\n` : "";
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
  }

  private async *streamTextChunks(text: string): AsyncGenerator<string> {
    const chunkSize = 12;
    for (let index = 0; index < text.length; index += chunkSize) {
      yield text.slice(index, index + chunkSize);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }

  private parsePendingPlan(value: unknown): BuilderPlan | undefined {
    const normalizedValue =
      value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== "context"),
          )
        : value;
    const result = BuilderPlanSchema.safeParse(normalizedValue);
    return result.success ? result.data : undefined;
  }

  private async loadCatalogContext(userId: number): Promise<CatalogContext> {
    const [
      appCategories,
      pluginCategories,
      chatModels,
      availablePlugins,
      ownedPlugins,
      ownedKnowledge,
    ] = await Promise.all([
      this.appCategoryRepository.find({ order: { sort: "ASC", id: "ASC" } }),
      this.pluginCategoryRepository.find({
        order: { sort: "ASC", id: "ASC" },
      }),
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

  private createPromptCatalog(context: CatalogContext) {
    const publicPluginIds = new Set(
      context.availablePlugins.map((plugin) => plugin.id),
    );
    const mapPlugin = (plugin: Plugin) => ({
      id: plugin.id,
      name: plugin.name,
      description: compact(plugin.description),
      category: plugin.category?.name,
      published: plugin.published,
    });

    return {
      appCategories: context.appCategories.map((item) => ({
        id: item.id,
        key: item.key,
        name: item.name,
      })),
      pluginCategories: context.pluginCategories.map((item) => ({
        id: item.id,
        key: item.key,
        name: item.name,
      })),
      chatModels: context.chatModels,
      publicPlugins: uniqueById(context.availablePlugins).map(mapPlugin),
      userPlugins: uniqueById(
        context.ownedPlugins.filter((plugin) => !publicPluginIds.has(plugin.id)),
      ).map(mapPlugin),
      userKnowledge: context.ownedKnowledge.map((item) => ({
        id: item.id,
        name: item.name,
        description: compact(item.description),
      })),
    };
  }

  private normalizePlan(
    plan: BuilderPlan,
    context: CatalogContext,
    pendingPlan: BuilderPlan | undefined,
  ): NormalizedBuilderPlan {
    const hasPendingPlan = Boolean(pendingPlan);
    const defaultAppCategory = context.appCategories[0];
    const defaultPluginCategory = context.pluginCategories[0];
    const defaultModel =
      context.chatModels.find((item) => item.isDefault) ??
      context.chatModels[0];
    const pluginIds = new Set([
      ...context.availablePlugins.map((item) => item.id),
      ...context.ownedPlugins.map((item) => item.id),
    ]);
    const knowledgeIds = new Set(context.ownedKnowledge.map((item) => item.id));

    if (!hasPendingPlan && plan.action === "create") {
      plan.action = "draft";
    }

    if (pendingPlan && plan.action !== "answer") {
      plan.app ??= pendingPlan.app;
      plan.plugin ??= pendingPlan.plugin;
      if (plan.intent === "clarify" && (plan.app || plan.plugin)) {
        plan.intent = plan.app ? "create_app" : "create_plugin";
        plan.action = "draft";
      }
    }

    if (plan.intent === "answer") {
      plan.action = "answer";
      plan.app = undefined;
      plan.plugin = undefined;
    }

    if (plan.intent === "clarify") {
      plan.action = "clarify";
      plan.app = undefined;
      plan.plugin = undefined;
    }

    if (plan.app) {
      plan.app.categoryId = context.appCategories.some(
        (item) => item.id === plan.app?.categoryId,
      )
        ? plan.app.categoryId
        : defaultAppCategory?.id;
      plan.app.llmId = context.chatModels.some(
        (item) => item.id === plan.app?.llmId,
      )
        ? plan.app.llmId
        : defaultModel?.id;
      plan.app.pluginIds = [...new Set(plan.app.pluginIds)].filter((id) =>
        pluginIds.has(id),
      );
      plan.app.knowledgeIds = [...new Set(plan.app.knowledgeIds)].filter((id) =>
        knowledgeIds.has(id),
      );
      plan.app.capabilities = [];
      plan.app.openingStatement.questions =
        plan.app.openingStatement.questions.slice(0, 4);
    }

    if (plan.plugin) {
      if (plan.plugin.needsMoreInfo || !plan.plugin.openapiSchema.trim()) {
        plan.plugin = undefined;
        plan.action = "clarify";
      } else {
        plan.plugin.categoryId = context.pluginCategories.some(
          (item) => item.id === plan.plugin?.categoryId,
        )
          ? plan.plugin.categoryId
          : defaultPluginCategory?.id;
      }
    }

    if (
      plan.action === "create" &&
      !(
        (plan.intent === "create_app" && plan.app) ||
        (plan.intent === "create_plugin" && plan.plugin)
      )
    ) {
      plan.action = "clarify";
    }

    return {
      ...plan,
      context: {
        appCategories: context.appCategories,
        pluginCategories: context.pluginCategories,
        chatModels: context.chatModels,
        selectedPlugins: plan.app?.pluginIds?.length
          ? uniqueById(context.availablePlugins.concat(context.ownedPlugins))
              .filter((item) => plan.app?.pluginIds.includes(item.id))
          : [],
        selectedKnowledge: plan.app?.knowledgeIds?.length
          ? context.ownedKnowledge.filter((item) =>
              plan.app?.knowledgeIds.includes(item.id),
            )
          : [],
      },
    };
  }
}
