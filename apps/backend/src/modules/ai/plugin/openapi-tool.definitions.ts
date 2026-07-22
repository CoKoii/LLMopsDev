import type { Plugin } from "./entities/plugin.entity";
import {
  HTTP_METHODS,
  type OpenApiDocument,
  type OpenApiParameter,
  type OpenApiToolDefinition,
} from "./openapi-tool.types";
import { isRecord, resolveReference } from "./openapi-tool.utils";

const parseOpenApiSchema = (plugin: Plugin): OpenApiDocument | null => {
  try {
    const schema: unknown = JSON.parse(plugin.openapiSchema);
    return isRecord(schema) ? schema : null;
  } catch {
    return null;
  }
};

const getBaseUrl = (document: OpenApiDocument) => {
  const firstServer = document.servers?.find((item) => isRecord(item));
  const url = firstServer?.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
};

const normalizeParameters = (
  document: OpenApiDocument,
  ...sources: unknown[]
) => {
  const parameters: OpenApiParameter[] = [];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const resolved = resolveReference(item, document);
      if (!isRecord(resolved)) continue;
      parameters.push(resolved);
    }
  }

  return parameters;
};

export const createOpenApiToolDefinitions = (plugin: Plugin) => {
  const document = parseOpenApiSchema(plugin);
  if (!document || !isRecord(document.paths)) return [];

  const baseUrl = getBaseUrl(document);
  const definitions: OpenApiToolDefinition[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!isRecord(pathItem)) continue;
    const pathParameters = normalizeParameters(document, pathItem.parameters);

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!isRecord(operation)) continue;
      if (typeof operation.operationId !== "string") continue;

      const operationId = operation.operationId.trim();
      if (!operationId) continue;

      definitions.push({
        plugin,
        document,
        baseUrl,
        path,
        method: method.toUpperCase(),
        operationId,
        operation,
        parameters: normalizeParameters(
          document,
          pathParameters,
          operation.parameters,
        ),
      });
    }
  }

  return definitions;
};
