import type { OpenApiToolDefinition } from "./openapi-tool.types";

const MAX_TOOL_NAME_LENGTH = 64;

const sanitizeToolName = (value: string, fallback: string) => {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_");
  return sanitized || fallback;
};

const createStableHash = (value: string) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
};

export const createUniqueToolName = (
  definition: OpenApiToolDefinition,
  usedNames: Set<string>,
) => {
  const base = sanitizeToolName(
    definition.operationId,
    "openapiOperation",
  ).slice(0, MAX_TOOL_NAME_LENGTH);
  if (!usedNames.has(base)) return base;

  const hash = createStableHash(
    `${definition.plugin.id}:${definition.method}:${definition.path}:${definition.operationId}`,
  );
  const suffix = `__p${definition.plugin.id}_${definition.method.toLowerCase()}_${hash}`;
  const prefix = base.slice(
    0,
    Math.max(1, MAX_TOOL_NAME_LENGTH - suffix.length),
  );
  let name = `${prefix}${suffix}`;
  let counter = 2;

  while (usedNames.has(name)) {
    const counterSuffix = `${suffix}_${counter}`;
    name = `${base.slice(0, Math.max(1, MAX_TOOL_NAME_LENGTH - counterSuffix.length))}${counterSuffix}`;
    counter += 1;
  }

  return name;
};
