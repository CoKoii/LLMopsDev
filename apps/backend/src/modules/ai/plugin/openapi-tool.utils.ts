import {
  type OpenApiDocument,
  type OpenApiRequestBody,
  type RequestBodyConfig,
} from "./openapi-tool.types";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveJsonPointer = (
  document: OpenApiDocument,
  reference: string,
): unknown => {
  if (!reference.startsWith("#/")) return null;

  let current: unknown = document;
  const segments = reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  for (const segment of segments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }

  return current;
};

export const resolveReference = (
  value: unknown,
  document: OpenApiDocument,
  seen = new Set<string>(),
): unknown => {
  if (!isRecord(value) || typeof value.$ref !== "string") return value;
  if (seen.has(value.$ref)) return value;

  const resolved = resolveJsonPointer(document, value.$ref);
  if (resolved === null || resolved === undefined) return value;

  seen.add(value.$ref);
  return resolveReference(resolved, document, seen);
};

export const getRequestBodyConfig = (
  requestBodyValue: unknown,
  document: OpenApiDocument,
): RequestBodyConfig | null => {
  const resolvedRequestBody = resolveReference(requestBodyValue, document);
  if (!isRecord(resolvedRequestBody)) return null;
  const requestBody: OpenApiRequestBody = resolvedRequestBody;
  if (!isRecord(requestBody.content)) return null;

  const jsonContent = resolveReference(
    requestBody.content["application/json"],
    document,
  );
  if (isRecord(jsonContent)) {
    return {
      contentType: "application/json",
      required: requestBody.required === true,
      schema: jsonContent.schema,
    };
  }

  const formContent = resolveReference(
    requestBody.content["application/x-www-form-urlencoded"],
    document,
  );
  if (isRecord(formContent)) {
    return {
      contentType: "application/x-www-form-urlencoded",
      required: requestBody.required === true,
      schema: formContent.schema,
    };
  }

  return null;
};

export const stringifyParameterValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }
  return JSON.stringify(value);
};
