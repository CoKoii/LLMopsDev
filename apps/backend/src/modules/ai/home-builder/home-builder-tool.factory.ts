import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { AppService } from "../app/app.service";
import type { AiAppVersionConfig } from "../app/entities/app-version.entity";
import { PluginService } from "../plugin/plugin.service";
import {
  createAppInputSchema,
  createPluginInputSchema,
} from "./home-builder.schemas";
import type {
  HomeBuilderCatalogContext,
  HomeBuilderCreatedResource,
  HomeBuilderToolResult,
} from "./home-builder.types";

const compact = (value?: string | null, limit = 160) => {
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
    let creationStarted = false;
    const runCreation = async <T>(operation: () => Promise<T>) => {
      if (creationStarted) {
        throw new BadRequestException("本轮已经执行过创建操作");
      }
      creationStarted = true;
      return operation();
    };

    return [
      tool(
        async (args: z.infer<typeof createAppInputSchema>) => {
          const input = createAppInputSchema.parse(args);
          const created = await runCreation(() =>
            this.createApp(context, input, userId),
          );
          return serializeResult({
            kind: "created",
            resource: created,
            reply: input.completionMessage,
          });
        },
        {
          name: "home_builder_create_app",
          description:
            "信息足以确定核心使用效果时，使用资源目录中的真实 id 和完整配置立即创建 AI 应用。成功后直接回复用户，不再调用工具。",
          schema: createAppInputSchema,
        },
      ),
      tool(
        async (args: z.infer<typeof createPluginInputSchema>) => {
          const input = createPluginInputSchema.parse(args);
          const created = await runCreation(() =>
            this.createPlugin(context, input, userId),
          );
          return serializeResult({
            kind: "created",
            resource: created,
            reply: input.completionMessage,
          });
        },
        {
          name: "home_builder_create_plugin",
          description:
            "用户已经提供足够完整真实的接口资料时，生成 OpenAPI 配置并立即创建插件。成功后直接回复用户，不再调用工具。",
          schema: createPluginInputSchema,
        },
      ),
    ];
  }

  describeResources(context: HomeBuilderCatalogContext) {
    const publicPluginIds = new Set(
      context.availablePlugins.map((item) => item.id),
    );

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
      publicPlugins: context.availablePlugins.map((item) => ({
        id: item.id,
        name: item.name,
        description: compact(item.description),
        category: item.category?.name,
      })),
      userPlugins: context.ownedPlugins
        .filter((item) => !publicPluginIds.has(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: compact(item.description),
          category: item.category?.name,
        })),
      userKnowledge: context.ownedKnowledge.map((item) => ({
        id: item.id,
        name: item.name,
        description: compact(item.description),
      })),
    };
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
}
