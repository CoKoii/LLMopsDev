const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
const PARAMETER_LOCATIONS = new Set(["query", "path", "header", "cookie"]);
const REQUEST_BODY_CONTENT_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
];

type OpenApiDocument = {
  openapi?: unknown;
  info?: unknown;
  servers?: unknown;
  paths?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validateOptionalBoolean = (
  value: unknown,
  path: string,
  errors: string[],
) => {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${path} 必须是布尔值`);
  }
};

const resolveJsonPointer = (
  document: OpenApiDocument,
  reference: string,
): unknown => {
  if (!reference.startsWith("#/")) return undefined;

  let current: unknown = document;
  const segments = reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }

  return current;
};

const resolveReference = (
  value: unknown,
  document: OpenApiDocument,
  seen = new Set<string>(),
): unknown => {
  if (!isRecord(value) || typeof value.$ref !== "string") return value;
  if (seen.has(value.$ref)) return value;

  const resolved = resolveJsonPointer(document, value.$ref);
  if (resolved === undefined) return value;

  seen.add(value.$ref);
  return resolveReference(resolved, document, seen);
};

const validateSchema = (
  schema: unknown,
  document: OpenApiDocument,
  path: string,
  errors: string[],
) => {
  const resolved = resolveReference(schema, document);
  if (!isRecord(resolved)) {
    errors.push(`${path}.schema 必须填写对象`);
    return;
  }

  if (!isNonEmptyString(resolved.type) && !Array.isArray(resolved.type)) {
    errors.push(`${path}.schema.type 必须填写`);
  }
};

const validateParameters = (
  parameters: unknown,
  document: OpenApiDocument,
  path: string,
  apiPath: string,
  errors: string[],
) => {
  if (parameters === undefined) return;
  if (!Array.isArray(parameters)) {
    errors.push(`${path} 必须是数组`);
    return;
  }

  parameters.forEach((parameterValue, index) => {
    const parameterPath = `${path}[${index}]`;
    const parameter = resolveReference(parameterValue, document);
    if (!isRecord(parameter)) {
      errors.push(`${parameterPath} 必须是对象`);
      return;
    }

    if (!isNonEmptyString(parameter.name)) {
      errors.push(`${parameterPath}.name 必须填写`);
    }
    if (
      !isNonEmptyString(parameter.in) ||
      !PARAMETER_LOCATIONS.has(parameter.in)
    ) {
      errors.push(`${parameterPath}.in 必须是 query/path/header/cookie`);
    }
    validateOptionalBoolean(
      parameter.required,
      `${parameterPath}.required`,
      errors,
    );
    validateSchema(parameter.schema, document, parameterPath, errors);

    if (parameter.in === "path" && isNonEmptyString(parameter.name)) {
      if (parameter.required !== true) {
        errors.push(`${parameterPath}.required 路径参数必须为 true`);
      }
      if (!apiPath.includes(`{${parameter.name}}`)) {
        errors.push(`${parameterPath}.name 必须出现在路径 ${apiPath} 中`);
      }
    }
  });
};

const validateRequestBody = (
  requestBodyValue: unknown,
  document: OpenApiDocument,
  path: string,
  errors: string[],
) => {
  if (requestBodyValue === undefined) return;

  const requestBody = resolveReference(requestBodyValue, document);
  if (!isRecord(requestBody)) {
    errors.push(`${path} 必须是对象`);
    return;
  }

  validateOptionalBoolean(requestBody.required, `${path}.required`, errors);
  if (!isRecord(requestBody.content)) {
    errors.push(`${path}.content 必须填写`);
    return;
  }

  const content = requestBody.content;
  const matchedEntry = REQUEST_BODY_CONTENT_TYPES.map((contentType) => ({
    contentType,
    mediaType: content[contentType],
  })).find(
    (
      entry,
    ): entry is { contentType: string; mediaType: Record<string, unknown> } =>
      isRecord(entry.mediaType),
  );
  if (!matchedEntry) {
    errors.push(
      `${path}.content 必须包含 application/json 或 application/x-www-form-urlencoded`,
    );
    return;
  }

  validateSchema(
    matchedEntry.mediaType.schema,
    document,
    `${path}.content.${matchedEntry.contentType}`,
    errors,
  );
};

const validateOperation = (
  operationValue: unknown,
  document: OpenApiDocument,
  path: string,
  apiPath: string,
  errors: string[],
) => {
  if (!isRecord(operationValue)) {
    errors.push(`${path} 必须是对象`);
    return;
  }

  if (!isNonEmptyString(operationValue.operationId)) {
    errors.push(`${path}.operationId 必须填写`);
  }
  if (
    !isRecord(operationValue.responses) ||
    Object.keys(operationValue.responses).length === 0
  ) {
    errors.push(`${path}.responses 必须填写`);
  }

  validateParameters(
    operationValue.parameters,
    document,
    `${path}.parameters`,
    apiPath,
    errors,
  );
  validateRequestBody(
    operationValue.requestBody,
    document,
    `${path}.requestBody`,
    errors,
  );
};

export const validatePluginOpenApiSchema = (source: string): string[] => {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    return ["OpenAPI Schema 必须是合法 JSON"];
  }

  if (!isRecord(parsed)) {
    return ["OpenAPI Schema 必须是 JSON 对象"];
  }

  const document: OpenApiDocument = parsed;
  if (!isNonEmptyString(document.openapi)) {
    errors.push("openapi 必须填写");
  }
  if (!isRecord(document.info)) {
    errors.push("info 必须填写");
  } else {
    if (!isNonEmptyString(document.info.title)) {
      errors.push("info.title 必须填写");
    }
    if (!isNonEmptyString(document.info.version)) {
      errors.push("info.version 必须填写");
    }
  }

  const servers: unknown[] | undefined = Array.isArray(document.servers)
    ? document.servers
    : undefined;
  if (!servers?.length) {
    errors.push("servers[0].url 必须填写");
  } else {
    const firstServer = servers[0];
    const serverUrl = isRecord(firstServer) ? firstServer.url : undefined;
    if (!isNonEmptyString(serverUrl)) {
      errors.push("servers[0].url 必须填写");
    } else {
      try {
        const url = new URL(serverUrl);
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.push("servers[0].url 只支持 HTTP/HTTPS");
        }
      } catch {
        errors.push("servers[0].url 必须是合法 URL");
      }
    }
  }

  if (!isRecord(document.paths) || Object.keys(document.paths).length === 0) {
    errors.push("paths 必须填写");
    return errors;
  }

  let operationCount = 0;
  for (const [apiPath, pathItem] of Object.entries(document.paths)) {
    if (!apiPath.startsWith("/")) {
      errors.push(`paths.${apiPath} 必须以 / 开头`);
    }
    if (!isRecord(pathItem)) {
      errors.push(`paths.${apiPath} 必须是对象`);
      continue;
    }

    validateParameters(
      pathItem.parameters,
      document,
      `paths.${apiPath}.parameters`,
      apiPath,
      errors,
    );

    for (const [method, operation] of Object.entries(pathItem)) {
      const normalizedMethod = method.toLowerCase();
      if (!HTTP_METHODS.has(normalizedMethod)) continue;

      operationCount += 1;
      validateOperation(
        operation,
        document,
        `paths.${apiPath}.${normalizedMethod}`,
        apiPath,
        errors,
      );
    }
  }

  if (operationCount === 0) {
    errors.push("paths 至少需要包含一个支持的方法");
  }

  return errors;
};
