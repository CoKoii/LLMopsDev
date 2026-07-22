import type { Plugin } from "./entities/plugin.entity";

export const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

export const TOOL_TIMEOUT_MS = 20000;

export type OpenApiDocument = {
  servers?: Array<{ url?: unknown }>;
  paths?: Record<string, unknown>;
  components?: unknown;
};

export type OpenApiOperation = {
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  parameters?: unknown;
  requestBody?: unknown;
};

export type OpenApiParameter = {
  name?: unknown;
  in?: unknown;
  required?: unknown;
  description?: unknown;
  schema?: unknown;
};

export type OpenApiRequestBody = {
  required?: unknown;
  content?: unknown;
};

export type JsonSchema = {
  type?: unknown;
  enum?: unknown;
  description?: unknown;
  nullable?: unknown;
  properties?: unknown;
  required?: unknown;
  items?: unknown;
};

export type OpenApiToolDefinition = {
  plugin: Plugin;
  document: OpenApiDocument;
  baseUrl: string | null;
  path: string;
  method: string;
  operationId: string;
  operation: OpenApiOperation;
  parameters: OpenApiParameter[];
};

export type RequestBodyConfig = {
  contentType: "application/json" | "application/x-www-form-urlencoded";
  required: boolean;
  schema?: unknown;
};
