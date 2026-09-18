import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Response } from "express";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { QueryFailedError } from "typeorm";
import type { Logger } from "winston";
import type { RequestWithRequestId } from "./request-id.middleware";

const DEFAULT_MESSAGE = "Internal Server Error";
const DATABASE_ERROR_MESSAGE = "数据库操作失败";
const isServerError = (statusCode: number) => statusCode >= 500;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const SENSITIVE_KEYS = [
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

const normalizeKey = (key: string) => key.replaceAll(/[-_]/g, "").toLowerCase();

const isSensitiveKey = (key: string) =>
  SENSITIVE_KEYS.includes(normalizeKey(key) as (typeof SENSITIVE_KEYS)[number]);

const toMessage = (value: unknown) => {
  if (value == null) {
    return DEFAULT_MESSAGE;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  return JSON.stringify(value) ?? DEFAULT_MESSAGE;
};

const resolveExceptionMessage = (exception: unknown) => {
  if (exception instanceof QueryFailedError) {
    return DATABASE_ERROR_MESSAGE;
  }
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    return toMessage(isRecord(response) ? response["message"] : response);
  }
  return DEFAULT_MESSAGE;
};

const resolveExceptionCode = (exception: unknown, fallbackCode: number) => {
  if (!(exception instanceof HttpException)) {
    return fallbackCode;
  }

  const response = exception.getResponse();
  if (!isRecord(response)) {
    return fallbackCode;
  }

  const code = response["code"];
  return typeof code === "number" && Number.isInteger(code)
    ? code
    : fallbackCode;
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

const maskToken = (authorization: string | string[] | null | undefined) => {
  const token =
    typeof authorization === "string" ? authorization : authorization?.[0];
  if (!token) {
    return null;
  }
  return token.length <= 8
    ? "[REDACTED]"
    : `${token.slice(0, 4)}...${token.slice(-4)}`;
};

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithRequestId>();
    const response = ctx.getResponse<Response>();
    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = resolveExceptionCode(exception, httpStatus);
    const message = resolveExceptionMessage(exception);
    const error = exception instanceof Error ? exception : undefined;
    const requestUser = (request as RequestWithRequestId & { user?: unknown })
      .user;
    const log = {
      context: AllExceptionFilter.name,
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      ip: request.ip,
      params: sanitizeValue(request.params ?? null),
      query: sanitizeValue(request.query ?? null),
      body: sanitizeValue((request.body as unknown) ?? null),
      user: sanitizeValue(requestUser ?? null),
      token: maskToken(request.headers["authorization"] ?? null),
      statusCode: httpStatus,
      exceptionMessage: message,
      errorMessage: error?.message,
      exception: error?.name ?? "UnknownException",
      ...(isServerError(httpStatus) ? { errorStack: error?.stack } : {}),
    };
    const logMessage = `[${request.originalUrl ?? request.url}]`;

    if (isServerError(httpStatus)) {
      this.logger.error(logMessage, log);
    } else {
      this.logger.warn(logMessage, log);
    }

    httpAdapter.reply(
      response,
      {
        code,
        message,
        data: null,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
      },
      httpStatus,
    );
  }
}
