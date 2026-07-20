import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { isIP } from "node:net";
import { In, Repository } from "typeorm";
import { z } from "zod";
import { type AiAppVersionConfig } from "../app/entities/app-version.entity";
import { Plugin, type PluginHeader } from "./entities/plugin.entity";

const SYSTEM_ENVIRONMENT_OPERATION_ID = "getSystemEnvironment";
const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
const MAX_TOOL_RESPONSE_LENGTH = 20000;
const TOOL_TIMEOUT_MS = 20000;

type OpenApiDocument = {
  servers?: Array<{ url?: unknown }>;
  paths?: Record<string, unknown>;
  components?: unknown;
};

type OpenApiOperation = {
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  parameters?: unknown;
  requestBody?: unknown;
};

type OpenApiParameter = {
  name?: unknown;
  in?: unknown;
  required?: unknown;
  description?: unknown;
  schema?: unknown;
};

type OpenApiRequestBody = {
  required?: unknown;
  content?: unknown;
};

type JsonSchema = {
  type?: unknown;
  enum?: unknown;
  description?: unknown;
  nullable?: unknown;
  properties?: unknown;
  required?: unknown;
  items?: unknown;
};

type OpenApiToolDefinition = {
  plugin: Plugin;
  document: OpenApiDocument;
  baseUrl: string | null;
  path: string;
  method: string;
  operationId: string;
  operation: OpenApiOperation;
  parameters: OpenApiParameter[];
};

type RequestBodyConfig = {
  contentType: "application/json" | "application/x-www-form-urlencoded";
  required: boolean;
  schema?: unknown;
};

@Injectable()
export class PluginToolService {
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

  private parseOpenApiSchema(plugin: Plugin): OpenApiDocument | null {
    try {
      const schema: unknown = JSON.parse(plugin.openapiSchema);
      return this.isRecord(schema) ? schema : null;
    } catch {
      return null;
    }
  }

  private getBaseUrl(document: OpenApiDocument) {
    const firstServer = document.servers?.find((item) => this.isRecord(item));
    const url = firstServer?.url;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }

  private resolveJsonPointer(document: OpenApiDocument, reference: string) {
    if (!reference.startsWith("#/")) return null;

    let current: unknown = document;
    const segments = reference
      .slice(2)
      .split("/")
      .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

    for (const segment of segments) {
      if (!this.isRecord(current)) return null;
      current = current[segment];
    }

    return current;
  }

  private resolveReference(
    value: unknown,
    document: OpenApiDocument,
    seen = new Set<string>(),
  ): unknown {
    if (!this.isRecord(value) || typeof value.$ref !== "string") return value;
    if (seen.has(value.$ref)) return value;

    const resolved = this.resolveJsonPointer(document, value.$ref);
    if (resolved === null || resolved === undefined) return value;

    seen.add(value.$ref);
    return this.resolveReference(resolved, document, seen);
  }

  private normalizeParameters(
    document: OpenApiDocument,
    ...sources: unknown[]
  ) {
    const parameters: OpenApiParameter[] = [];

    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      for (const item of source) {
        const resolved = this.resolveReference(item, document);
        if (!this.isRecord(resolved)) continue;
        parameters.push(resolved);
      }
    }

    return parameters;
  }

  private getOpenApiToolDefinitions(plugin: Plugin) {
    const document = this.parseOpenApiSchema(plugin);
    if (!document || !this.isRecord(document.paths)) return [];

    const baseUrl = this.getBaseUrl(document);

    const definitions: OpenApiToolDefinition[] = [];
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!this.isRecord(pathItem)) continue;
      const pathParameters = this.normalizeParameters(
        document,
        pathItem.parameters,
      );

      for (const [method, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method.toLowerCase())) continue;
        if (!this.isRecord(operation)) continue;
        if (typeof operation.operationId !== "string") continue;

        definitions.push({
          plugin,
          document,
          baseUrl,
          path,
          method: method.toUpperCase(),
          operationId: operation.operationId,
          operation,
          parameters: this.normalizeParameters(
            document,
            pathParameters,
            operation.parameters,
          ),
        });
      }
    }

    return definitions;
  }

  private sanitizeToolName(value: string, fallback: string) {
    const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_");
    return sanitized || fallback;
  }

  private createToolName(operationId: string, pluginId: number) {
    const suffix = `__p${pluginId}`;
    const base = this.sanitizeToolName(operationId, "openapiOperation");
    return `${base.slice(0, 64 - suffix.length)}${suffix}`;
  }

  private createZodSchema(
    schemaValue: unknown,
    document: OpenApiDocument,
  ): z.ZodTypeAny {
    const resolvedSchema = this.resolveReference(schemaValue, document);
    const schema: JsonSchema | null = this.isRecord(resolvedSchema)
      ? resolvedSchema
      : null;
    if (!schema) return z.unknown();

    const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
    if (enumValues?.length) {
      const stringValues = enumValues.filter(
        (item): item is string => typeof item === "string",
      );
      if (
        stringValues.length === enumValues.length &&
        stringValues.length > 0
      ) {
        const [first, ...rest] = stringValues;
        return z.enum([first, ...rest]);
      }
    }

    const typeValues = Array.isArray(schema.type)
      ? schema.type.filter((item): item is string => typeof item === "string")
      : typeof schema.type === "string"
        ? [schema.type]
        : [];
    const nullable =
      schema.nullable === true || typeValues.some((type) => type === "null");
    const type = typeValues.find((item) => item !== "null");

    let zodSchema: z.ZodTypeAny;
    switch (type) {
      case "boolean":
        zodSchema = z.boolean();
        break;
      case "integer":
        zodSchema = z.number().int();
        break;
      case "number":
        zodSchema = z.number();
        break;
      case "array":
        zodSchema = z.array(this.createZodSchema(schema.items, document));
        break;
      case "object":
        zodSchema = this.createObjectZodSchema(schema, document);
        break;
      case "string":
        zodSchema = z.string();
        break;
      default:
        zodSchema = z.unknown();
        break;
    }

    if (typeof schema.description === "string" && schema.description.trim()) {
      zodSchema = zodSchema.describe(schema.description.trim());
    }

    return nullable ? zodSchema.nullable() : zodSchema;
  }

  private createObjectZodSchema(
    schema: JsonSchema,
    document: OpenApiDocument,
  ): z.ZodTypeAny {
    if (!this.isRecord(schema.properties))
      return z.record(z.string(), z.unknown());

    const requiredFields = Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      const propertyZod = this.createZodSchema(propertySchema, document);
      shape[key] = requiredFields.includes(key)
        ? propertyZod
        : propertyZod.optional();
    }

    return z.object(shape);
  }

  private describeParameter(parameter: OpenApiParameter) {
    const location = typeof parameter.in === "string" ? parameter.in : "query";
    const description =
      typeof parameter.description === "string"
        ? parameter.description.trim()
        : "";
    return [location, description].filter(Boolean).join(" parameter. ");
  }

  private getRequestBodyConfig(
    requestBodyValue: unknown,
    document: OpenApiDocument,
  ): RequestBodyConfig | null {
    const resolvedRequestBody = this.resolveReference(
      requestBodyValue,
      document,
    );
    if (!this.isRecord(resolvedRequestBody)) return null;
    const requestBody: OpenApiRequestBody = resolvedRequestBody;
    if (!this.isRecord(requestBody.content)) return null;

    const jsonContent = this.resolveReference(
      requestBody.content["application/json"],
      document,
    );
    if (this.isRecord(jsonContent)) {
      return {
        contentType: "application/json",
        required: requestBody.required === true,
        schema: jsonContent.schema,
      };
    }

    const formContent = this.resolveReference(
      requestBody.content["application/x-www-form-urlencoded"],
      document,
    );
    if (this.isRecord(formContent)) {
      return {
        contentType: "application/x-www-form-urlencoded",
        required: requestBody.required === true,
        schema: formContent.schema,
      };
    }

    return null;
  }

  private createToolSchema(definition: OpenApiToolDefinition) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const parameter of definition.parameters) {
      if (typeof parameter.name !== "string" || !parameter.name.trim())
        continue;
      const parameterSchema = this.createZodSchema(
        parameter.schema,
        definition.document,
      );
      const describedSchema = parameterSchema.describe(
        this.describeParameter(parameter),
      );
      shape[parameter.name] =
        parameter.required === true
          ? describedSchema
          : describedSchema.optional();
    }

    const requestBody = this.getRequestBodyConfig(
      definition.operation.requestBody,
      definition.document,
    );
    if (requestBody) {
      const bodySchema = this.createZodSchema(
        requestBody.schema,
        definition.document,
      ).describe("HTTP request body.");
      shape.body = requestBody.required ? bodySchema : bodySchema.optional();
    }

    return z.object(shape);
  }

  private createToolDescription(definition: OpenApiToolDefinition) {
    const summary =
      typeof definition.operation.summary === "string"
        ? definition.operation.summary.trim()
        : "";
    const description =
      typeof definition.operation.description === "string"
        ? definition.operation.description.trim()
        : "";

    return [
      definition.plugin.name,
      summary || description || definition.plugin.description || "",
      definition.operationId,
      definition.parameters
        .map((parameter) =>
          typeof parameter.name === "string" ? parameter.name : "",
        )
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join("\n");
  }

  private createHeaders(headers?: PluginHeader[] | null) {
    const output = new Headers();

    for (const header of headers ?? []) {
      const key = header.key.trim();
      const value = header.value.trim();
      if (key && value) output.set(key, value);
    }

    return output;
  }

  private isPrivateIpAddress(hostname: string) {
    const version = isIP(hostname);
    if (version === 4) {
      const parts = hostname.split(".").map((part) => Number(part));
      const [first, second] = parts;
      return (
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254) ||
        first === 0
      );
    }

    if (version === 6) {
      const normalized = hostname.toLowerCase();
      return (
        normalized === "::1" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe80")
      );
    }

    return false;
  }

  private assertFetchableUrl(url: URL) {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("插件接口只支持 HTTP/HTTPS URL。");
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      this.isPrivateIpAddress(hostname)
    ) {
      throw new Error("插件接口不允许请求本机或私有网络地址。");
    }
  }

  private stringifyParameterValue(value: unknown) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return value.toString();
    }
    return JSON.stringify(value);
  }

  private createUrl(
    definition: OpenApiToolDefinition,
    args: Record<string, unknown>,
  ) {
    let path = definition.path;
    if (!definition.baseUrl) {
      throw new Error("插件 OpenAPI Schema 缺少 servers[0].url。");
    }

    for (const parameter of definition.parameters) {
      if (parameter.in !== "path" || typeof parameter.name !== "string") {
        continue;
      }
      const value = args[parameter.name];
      if (value === undefined || value === null) {
        throw new Error(`缺少路径参数：${parameter.name}`);
      }
      path = path.replaceAll(
        `{${parameter.name}}`,
        encodeURIComponent(this.stringifyParameterValue(value)),
      );
    }

    const url = new URL(path, definition.baseUrl);
    this.assertFetchableUrl(url);

    for (const parameter of definition.parameters) {
      if (parameter.in !== "query" || typeof parameter.name !== "string") {
        continue;
      }
      const value = args[parameter.name];
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(
            parameter.name,
            this.stringifyParameterValue(item),
          );
        }
      } else {
        url.searchParams.set(
          parameter.name,
          this.stringifyParameterValue(value),
        );
      }
    }

    return url;
  }

  private applyParameterHeaders(
    headers: Headers,
    definition: OpenApiToolDefinition,
    args: Record<string, unknown>,
  ) {
    const cookies: string[] = [];
    for (const parameter of definition.parameters) {
      if (typeof parameter.name !== "string") continue;
      const value = args[parameter.name];
      if (value === undefined || value === null) continue;

      if (parameter.in === "header") {
        headers.set(parameter.name, this.stringifyParameterValue(value));
      }
      if (parameter.in === "cookie") {
        cookies.push(
          `${parameter.name}=${encodeURIComponent(
            this.stringifyParameterValue(value),
          )}`,
        );
      }
    }

    if (cookies.length) {
      const existingCookie = headers.get("cookie");
      headers.set(
        "cookie",
        existingCookie
          ? `${existingCookie}; ${cookies.join("; ")}`
          : cookies.join("; "),
      );
    }
  }

  private createRequestBody(
    headers: Headers,
    definition: OpenApiToolDefinition,
    args: Record<string, unknown>,
  ) {
    if (["GET", "HEAD"].includes(definition.method)) return undefined;

    const requestBody = this.getRequestBodyConfig(
      definition.operation.requestBody,
      definition.document,
    );
    if (!requestBody) return undefined;

    const body = args.body;
    if (body === undefined || body === null) {
      if (requestBody.required) throw new Error("缺少请求体 body。");
      return undefined;
    }

    headers.set("content-type", requestBody.contentType);
    if (requestBody.contentType === "application/json") {
      return JSON.stringify(body);
    }

    const params = new URLSearchParams();
    if (this.isRecord(body)) {
      for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) continue;
        params.set(key, this.stringifyParameterValue(value));
      }
    }
    return params.toString();
  }

  private async parseToolResponse(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const payload = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
    };
    const serialized = JSON.stringify(payload);

    return serialized.length > MAX_TOOL_RESPONSE_LENGTH
      ? `${serialized.slice(0, MAX_TOOL_RESPONSE_LENGTH)}...`
      : serialized;
  }

  private createOpenApiTool(
    definition: OpenApiToolDefinition,
    toolName: string,
  ) {
    return tool(
      async (args: Record<string, unknown>) => {
        const headers = this.createHeaders(definition.plugin.headers);
        this.applyParameterHeaders(headers, definition, args);
        const url = this.createUrl(definition, args);
        const body = this.createRequestBody(headers, definition, args);
        const response = await fetch(url, {
          method: definition.method,
          headers,
          body,
          signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
        });

        return this.parseToolResponse(response);
      },
      {
        name: toolName,
        description: this.createToolDescription(definition),
        schema: this.createToolSchema(definition),
      },
    );
  }

  private isVisibleForExecution(plugin: Plugin, userId: number) {
    if (plugin.category?.key === "builtin") return true;
    return plugin.createdBy === userId;
  }

  async loadEnabledTools(config: AiAppVersionConfig, userId: number) {
    const pluginIds = [...new Set(config.pluginIds ?? [])];
    if (!pluginIds.length) return [];

    const plugins = await this.pluginRepository.find({
      where: { id: In(pluginIds) },
      relations: { category: true },
    });
    const tools = new Map<string, StructuredToolInterface>();
    const definitions = plugins
      .filter(
        (plugin) => plugin.status && this.isVisibleForExecution(plugin, userId),
      )
      .flatMap((plugin) => this.getOpenApiToolDefinitions(plugin));
    const operationCounts = new Map<string, number>();

    for (const definition of definitions) {
      operationCounts.set(
        definition.operationId,
        (operationCounts.get(definition.operationId) ?? 0) + 1,
      );
    }

    for (const definition of definitions) {
      if (
        definition.plugin.category?.key === "builtin" &&
        definition.operationId === SYSTEM_ENVIRONMENT_OPERATION_ID
      ) {
        tools.set(
          SYSTEM_ENVIRONMENT_OPERATION_ID,
          this.createSystemEnvironmentTool(),
        );
        continue;
      }

      if (!definition.baseUrl) continue;

      const toolName =
        operationCounts.get(definition.operationId) === 1
          ? this.sanitizeToolName(definition.operationId, "openapiOperation")
          : this.createToolName(definition.operationId, definition.plugin.id);
      const openApiTool = this.createOpenApiTool(definition, toolName);
      tools.set(openApiTool.name, openApiTool);
    }

    return [...tools.values()];
  }
}
