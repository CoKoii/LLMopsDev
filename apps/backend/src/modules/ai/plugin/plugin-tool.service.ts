import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import type { AiAppVersionConfig } from "../app/entities/app-version.entity";
import { Plugin } from "./entities/plugin.entity";
import { createOpenApiToolDefinitions } from "./openapi-tool.definitions";
import { executeOpenApiToolRequest } from "./openapi-tool.executor";
import { createUniqueToolName } from "./openapi-tool.naming";
import { createToolDescription, createToolSchema } from "./openapi-tool.schema";
import type { OpenApiToolDefinition } from "./openapi-tool.types";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

@Injectable()
export class PluginToolService {
  private readonly logger = new Logger(PluginToolService.name);

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
  ) {}

  private canExecute(plugin: Plugin, userId: number) {
    return plugin.published || plugin.createdBy === userId;
  }

  private serializeToolError(
    error: unknown,
    definition: OpenApiToolDefinition,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.warn(
      `插件工具调用失败: ${definition.plugin.name}/${definition.operationId} ${definition.method} ${definition.path}: ${message}`,
      stack,
    );

    return JSON.stringify({
      ok: false,
      error: message,
      operationId: definition.operationId,
    });
  }

  private getOperationSettings(
    config: AiAppVersionConfig,
    definition: OpenApiToolDefinition,
  ): Record<string, unknown> {
    const pluginSettings =
      config.pluginSettings?.[String(definition.plugin.id)];
    const operationSettings = pluginSettings?.[definition.operationId];
    return isPlainRecord(operationSettings) ? operationSettings : {};
  }

  private mergeToolArgs(
    settings: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...settings, ...args };
    const defaultBody = settings.body;
    const inputBody = args.body;

    if (isPlainRecord(defaultBody) && isPlainRecord(inputBody)) {
      merged.body = { ...defaultBody, ...inputBody };
    }

    return merged;
  }

  private createTool(
    definition: OpenApiToolDefinition,
    name: string,
    config: AiAppVersionConfig,
  ) {
    const settings = this.getOperationSettings(config, definition);

    return tool(
      async (args: Record<string, unknown>) => {
        try {
          return await executeOpenApiToolRequest(
            definition,
            this.mergeToolArgs(settings, args),
          );
        } catch (error) {
          return this.serializeToolError(error, definition);
        }
      },
      {
        name,
        description: createToolDescription(definition),
        schema: createToolSchema(definition),
      },
    );
  }

  async loadEnabledTools(
    config: AiAppVersionConfig,
    userId: number,
  ): Promise<StructuredToolInterface[]> {
    const pluginIds = [...new Set(config.pluginIds ?? [])];
    if (!pluginIds.length) return [];

    const plugins = await this.pluginRepository.find({
      where: { id: In(pluginIds) },
    });
    const usedToolNames = new Set<string>();

    return plugins
      .filter((plugin) => plugin.status && this.canExecute(plugin, userId))
      .flatMap((plugin) => createOpenApiToolDefinitions(plugin))
      .filter((definition) => definition.baseUrl)
      .map((definition) => {
        const name = createUniqueToolName(definition, usedToolNames);
        usedToolNames.add(name);
        return this.createTool(definition, name, config);
      });
  }
}
