import { isIP } from "node:net";
import type { PluginHeader } from "./entities/plugin.entity";
import {
  TOOL_TIMEOUT_MS,
  type OpenApiToolDefinition,
} from "./openapi-tool.types";
import {
  getRequestBodyConfig,
  isRecord,
  stringifyParameterValue,
} from "./openapi-tool.utils";

const createHeaders = (headers?: PluginHeader[] | null) => {
  const output = new Headers();

  for (const header of headers ?? []) {
    const key = header.key.trim();
    const value = header.value.trim();
    if (key && value) output.set(key, value);
  }

  return output;
};

const isPrivateIpAddress = (hostname: string) => {
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
};

const assertFetchableUrl = (url: URL) => {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("插件接口只支持 HTTP/HTTPS URL。");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpAddress(hostname)
  ) {
    throw new Error("插件接口不允许请求本机或私有网络地址。");
  }
};

const createUrl = (
  definition: OpenApiToolDefinition,
  args: Record<string, unknown>,
) => {
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
      encodeURIComponent(stringifyParameterValue(value)),
    );
  }

  const url = new URL(path, definition.baseUrl);
  assertFetchableUrl(url);

  for (const parameter of definition.parameters) {
    if (parameter.in !== "query" || typeof parameter.name !== "string") {
      continue;
    }
    const value = args[parameter.name];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(parameter.name, stringifyParameterValue(item));
      }
    } else {
      url.searchParams.set(parameter.name, stringifyParameterValue(value));
    }
  }

  return url;
};

const applyParameterHeaders = (
  headers: Headers,
  definition: OpenApiToolDefinition,
  args: Record<string, unknown>,
) => {
  const cookies: string[] = [];
  for (const parameter of definition.parameters) {
    if (typeof parameter.name !== "string") continue;
    const value = args[parameter.name];
    if (value === undefined || value === null) continue;

    if (parameter.in === "header") {
      headers.set(parameter.name, stringifyParameterValue(value));
    }
    if (parameter.in === "cookie") {
      cookies.push(
        `${parameter.name}=${encodeURIComponent(stringifyParameterValue(value))}`,
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
};

const createRequestBody = (
  headers: Headers,
  definition: OpenApiToolDefinition,
  args: Record<string, unknown>,
) => {
  if (["GET", "HEAD"].includes(definition.method)) return undefined;

  const requestBody = getRequestBodyConfig(
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
  if (isRecord(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      params.set(key, stringifyParameterValue(value));
    }
  }
  return params.toString();
};

const parseToolResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let body: unknown = text;
  if (contentType.includes("application/json") && text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return JSON.stringify({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
  });
};

export const executeOpenApiToolRequest = async (
  definition: OpenApiToolDefinition,
  args: Record<string, unknown>,
) => {
  const headers = createHeaders(definition.plugin.headers);
  applyParameterHeaders(headers, definition, args);
  const url = createUrl(definition, args);
  const body = createRequestBody(headers, definition, args);
  const response = await fetch(url, {
    method: definition.method,
    headers,
    body,
    signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
  });

  return parseToolResponse(response);
};
