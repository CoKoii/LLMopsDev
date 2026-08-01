import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { AppService } from "../app/app.service";
import type { AiAppVersionConfig } from "../app/entities/app-version.entity";
import { PluginService } from "../plugin/plugin.service";
import {
  catalogToolInputSchema,
  createAppInputSchema,
  createPluginInputSchema,
  requirementsInputSchema,
} from "./home-builder.schemas";
import type {
  HomeBuilderCatalogContext,
  HomeBuilderCreatedResource,
  HomeBuilderToolResult,
} from "./home-builder.types";

const compact = (value?: string | null, limit = 220) => {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const serializeResult = (result: HomeBuilderToolResult) =>
  JSON.stringify(result);

@Injectable()
export class HomeBuilderToolFactory {
  constructor(
    private readonly appService: AppService,
    private readonly pluginService: PluginService,
  ) {}

  create(
    context: HomeBuilderCatalogContext,
    userId: number,
  ): StructuredToolInterface[] {
    return [
      tool(
        (args: z.infer<typeof catalogToolInputSchema>) => {
          const input = catalogToolInputSchema.parse(args);
          return serializeResult({
            kind: "catalog",
            resources: this.createPromptCatalog(context, input.keyword),
          });
        },
        {
          name: "home_builder_catalog",
          description:
            "查询当前用户可用的应用分类、对话模型、公开及自有插件、自有知识库和插件分类。规划或创建资源前调用。",
          schema: catalogToolInputSchema,
        },
      ),
      tool(
        (args: z.infer<typeof requirementsInputSchema>) => {
          const input = requirementsInputSchema.parse(args);
          return serializeResult({
            kind: "needs_input",
            questions: input.questions,
          });
        },
        {
          name: "home_builder_ask_requirements",
          description:
            "需求不足以确定核心使用效果时调用。返回本轮需要自然询问用户的问题，不创建任何资源。",
          schema: requirementsInputSchema,
        },
      ),
      tool(
        async (args: z.infer<typeof createAppInputSchema>) => {
          const input = createAppInputSchema.parse(args);
          const created = await this.createApp(context, input, userId);
          return serializeResult({ kind: "created", resource: created });
        },
        {
          name: "home_builder_create_app",
          description:
            "需求足以确定核心使用效果时，使用完整配置立即创建 AI 应用。",
          schema: createAppInputSchema,
        },
      ),
      tool(
        async (args: z.infer<typeof createPluginInputSchema>) => {
          const input = createPluginInputSchema.parse(args);
          const created = await this.createPlugin(context, input, userId);
          return serializeResult({ kind: "created", resource: created });
        },
        {
          name: "home_builder_create_plugin",
          description:
            "用户已经提供足够真实接口资料时，生成完整 OpenAPI 配置并立即创建插件。",
          schema: createPluginInputSchema,
        },
      ),
    ];
  }

  private async createApp(
    context: HomeBuilderCatalogContext,
    input: z.infer<typeof createAppInputSchema>,
    userId: number,
  ): Promise<HomeBuilderCreatedResource> {
    if (!context.appCategories.some((item) => item.id === input.categoryId)) {
      throw new BadRequestException("应用分类不在可用资源目录中");
    }
    if (!context.chatModels.some((item) => item.id === input.llmId)) {
      throw new BadRequestException("对话模型不在可用资源目录中");
    }

    const selectablePluginIds = new Set([
      ...context.availablePlugins.map((item) => item.id),
      ...context.ownedPlugins.map((item) => item.id),
    ]);
    const selectableKnowledgeIds = new Set(
      context.ownedKnowledge.map((item) => item.id),
    );
    const pluginIds = [...new Set(input.pluginIds)].filter((id) =>
      selectablePluginIds.has(id),
    );
    const knowledgeIds = [...new Set(input.knowledgeIds)].filter((id) =>
      selectableKnowledgeIds.has(id),
    );
    const config: AiAppVersionConfig = {
      prompt: input.prompt,
      llmId: input.llmId,
      modelSettings: input.modelSettings,
      capabilities: [],
      pluginIds,
      pluginSettings: {},
      knowledge: {
        ids: knowledgeIds,
        settings: {
          strategy: "hybrid",
          limit: knowledgeIds.length ? 10 : 6,
          minScore: 0.2,
          vectorWeight: 0.7,
        },
      },
      toggles: {
        longTermMemory: Boolean(input.toggles.longTermMemory),
        questionSuggestions: input.toggles.questionSuggestions ?? true,
        voiceInput: Boolean(input.toggles.voiceInput),
        voiceOutput: Boolean(input.toggles.voiceOutput),
      },
      openingStatement: input.openingStatement,
    };
    const result = await this.appService.createWithConfig(
      {
        name: input.name,
        categoryId: input.categoryId,
        description: input.description,
        status: true,
      },
      config,
      userId,
    );

    return { type: "app", id: result.app.id, name: input.name };
  }

  private async createPlugin(
    context: HomeBuilderCatalogContext,
    input: z.infer<typeof createPluginInputSchema>,
    userId: number,
  ): Promise<HomeBuilderCreatedResource> {
    if (
      !context.pluginCategories.some((item) => item.id === input.categoryId)
    ) {
      throw new BadRequestException("插件分类不在可用资源目录中");
    }

    await this.pluginService.create(
      {
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        openapiSchema: input.openapiSchema,
        headers: input.headers,
        status: true,
        published: false,
      },
      userId,
    );

    return { type: "plugin", name: input.name };
  }

  private createPromptCatalog(
    context: HomeBuilderCatalogContext,
    keyword: string,
  ) {
    const term = keyword.trim().toLowerCase();
    const matches = (name: string, description?: string | null) =>
      !term || `${name} ${description ?? ""}`.toLowerCase().includes(term);

    return {
      appCategories: context.appCategories.map(({ id, key, name }) => ({
        id,
        key,
        name,
      })),
      pluginCategories: context.pluginCategories.map(({ id, key, name }) => ({
        id,
        key,
        name,
      })),
      chatModels: context.chatModels,
      publicPlugins: context.availablePlugins
        .filter((item) => matches(item.name, item.description))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: compact(item.description),
          category: item.category?.name,
        })),
      userPlugins: context.ownedPlugins
        .filter((item) => matches(item.name, item.description))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: compact(item.description),
          category: item.category?.name,
        })),
      userKnowledge: context.ownedKnowledge
        .filter((item) => matches(item.name, item.description))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: compact(item.description),
        })),
    };
  }
}
