import { HttpException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import type { RequestWithRequestId } from "./request-id.middleware";

const DEFAULT_MESSAGE = "Internal Server Error";
const DATABASE_ERROR_MESSAGE = "数据库操作失败";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const SENSITIVE_KEYWORDS = [
  "accesskeyid",
  "accesskeysecret",
  "apikey",
  "authorization",
  "confirmpassword",
  "cookie",
  "mailpass",
  "pass",
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
  "token",
] as const;

export type ExceptionLog = {
  context: string;
  requestId: string | undefined;
  method: string;
  path: string;
  ip: string | undefined;
  params: unknown;
  query: unknown;
  body: unknown;
  user: unknown;
  token: string | null;
  statusCode: number;
  exceptionMessage: string;
  errorMessage?: string;
  exception: string;
  errorStack?: string;
  causes?: ExceptionCause[];
};

type ExceptionCause = {
  message: string;
  exception: string;
  stack?: string;
};

const maskString = (value: string) =>
  value.length <= 8
    ? "[REDACTED]"
    : `${value.slice(0, 4)}...${value.slice(-4)}`;

const normalizeSensitiveKey = (key: string) =>
  key.replaceAll(/[-_]/g, "").toLowerCase();

const isSensitiveKey = (key: string) =>
  SENSITIVE_KEYWORDS.includes(
    normalizeSensitiveKey(key) as (typeof SENSITIVE_KEYWORDS)[number],
  );

const toMessage = (raw: unknown) =>
  raw == null
    ? DEFAULT_MESSAGE
    : typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((item) => String(item)).join(", ")
        : (JSON.stringify(raw) ?? DEFAULT_MESSAGE);

export const resolveExceptionMessage = (err: unknown): string => {
  if (err instanceof QueryFailedError) {
    return DATABASE_ERROR_MESSAGE;
  }

  if (err instanceof HttpException) {
    const responseBody = err.getResponse();
    const raw = isRecord(responseBody) ? responseBody["message"] : responseBody;
    return toMessage(raw);
  }

  return DEFAULT_MESSAGE;
};

const sanitizeValue = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(item, seen),
    ]),
  );
};

const sanitizeToken = (authorization: string | string[] | null | undefined) => {
  const token =
    typeof authorization === "string" ? authorization : authorization?.[0];
  return token ? maskString(token) : null;
};

const getCause = (error: Error): unknown =>
  (error as { cause?: unknown }).cause;

const describeCause = (
  cause: unknown,
  includeStack: boolean,
): ExceptionCause => {
  if (cause instanceof Error) {
    return {
      message: cause.message,
      exception: cause.name,
      ...(includeStack ? { stack: cause.stack } : {}),
    };
  }

  return {
    message: toMessage(cause),
    exception: typeof cause,
  };
};

const collectCauses = (
  error: Error | undefined,
  includeStack: boolean,
): ExceptionCause[] | undefined => {
  if (!error) {
    return undefined;
  }

  const causes: ExceptionCause[] = [];
  const seen = new WeakSet<object>();
  let current = getCause(error);

  while (current !== undefined && current !== null) {
    causes.push(describeCause(current, includeStack));

    if (!(current instanceof Error) || seen.has(current)) {
      break;
    }

    seen.add(current);
    current = getCause(current);
  }

  return causes.length ? causes : undefined;
};

export const buildExceptionLog = (
  context: string,
  request: RequestWithRequestId & { user?: unknown },
  statusCode: number,
  message: string,
  error?: Error,
): ExceptionLog => {
  const isServerError = statusCode >= 500;

  return {
    context,
    requestId: request.requestId,
    method: request.method,
    path: request.originalUrl ?? request.url,
    ip: request.ip,
    params: sanitizeValue(request.params ?? null),
    query: sanitizeValue(request.query ?? null),
    body: sanitizeValue((request.body as unknown) ?? null),
    user: sanitizeValue(request.user ?? null),
    token: sanitizeToken(request.headers["authorization"] ?? null),
    statusCode,
    exceptionMessage: message,
    errorMessage: error?.message,
    exception: error?.name ?? "UnknownException",
    causes: collectCauses(error, isServerError),
    ...(isServerError ? { errorStack: error?.stack } : {}),
  };
};

export const buildExceptionResponse = (
  statusCode: number,
  message: string,
  requestId?: string,
) => ({
  code: statusCode,
  message,
  data: null,
  requestId,
  timestamp: new Date().toISOString(),
});
