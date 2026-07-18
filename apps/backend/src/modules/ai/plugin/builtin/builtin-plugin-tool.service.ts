import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { z } from "zod";
import { type AiAppVersionConfig } from "../../app/entities/app-version.entity";
import { Plugin } from "../entities/plugin.entity";

const SYSTEM_ENVIRONMENT_OPERATION_ID = "getSystemEnvironment";

@Injectable()
export class BuiltinPluginToolService {
  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
  ) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private formatSystemEnvironment() {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const weekday = new Intl.DateTimeFormat("zh-CN", {
      weekday: "long",
      timeZone,
    }).format(now);
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).formatToParts(now);
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    }).formatToParts(now);
    const getPart = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const date = `${getPart(dateParts, "year")}-${getPart(dateParts, "month")}-${getPart(dateParts, "day")}`;
    const time = `${getPart(timeParts, "hour")}:${getPart(timeParts, "minute")}:${getPart(timeParts, "second")}`;

    return {
      datetime: `${date} ${time}`,
      date,
      time,
      weekday,
      timezone: timeZone,
    };
  }

  private createSystemEnvironmentTool(): StructuredToolInterface {
    return tool(() => JSON.stringify(this.formatSystemEnvironment()), {
      name: SYSTEM_ENVIRONMENT_OPERATION_ID,
      description:
        "查询当前时间、日期、星期、时区等系统环境基础信息。仅当用户询问当前时间、日期、星期或时区时调用。",
      schema: z.object({}),
    });
  }

  private getPluginOperationIds(plugin: Plugin) {
    let schema: unknown;
    try {
      schema = JSON.parse(plugin.openapiSchema);
    } catch {
      return [];
    }

    if (!this.isRecord(schema) || !this.isRecord(schema.paths)) return [];

    const operationIds = new Set<string>();
    for (const pathItem of Object.values(schema.paths)) {
      if (!this.isRecord(pathItem)) continue;
      for (const operation of Object.values(pathItem)) {
        if (
          this.isRecord(operation) &&
          typeof operation.operationId === "string"
        ) {
          operationIds.add(operation.operationId);
        }
      }
    }

    return [...operationIds];
  }

  private createTool(operationId: string) {
    if (operationId === SYSTEM_ENVIRONMENT_OPERATION_ID) {
      return this.createSystemEnvironmentTool();
    }

    return null;
  }

  async loadEnabledTools(config: AiAppVersionConfig) {
    const pluginIds = [...new Set(config.pluginIds ?? [])];
    if (!pluginIds.length) return [];

    const plugins = await this.pluginRepository.find({
      where: { id: In(pluginIds) },
      relations: { category: true },
    });
    const tools = new Map<string, StructuredToolInterface>();

    for (const plugin of plugins) {
      if (!plugin.status || plugin.category?.key !== "builtin") continue;

      for (const operationId of this.getPluginOperationIds(plugin)) {
        const builtinTool = this.createTool(operationId);
        if (builtinTool) {
          tools.set(builtinTool.name, builtinTool);
        }
      }
    }

    return [...tools.values()];
  }
}
