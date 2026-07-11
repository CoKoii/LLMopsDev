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
import type { Logger } from "winston";
import type { RequestWithRequestId } from "./request-id.middleware";
import {
  buildExceptionLog,
  buildExceptionResponse,
  resolveExceptionMessage,
} from "./exception.util";

const isServerError = (statusCode: number) => statusCode >= 500;

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
    const message = resolveExceptionMessage(exception);
    const error = exception instanceof Error ? exception : undefined;
    const log = buildExceptionLog(
      AllExceptionFilter.name,
      request,
      httpStatus,
      message,
      error,
    );
    const logMessage = `[${request.originalUrl ?? request.url}]`;

    if (isServerError(httpStatus)) {
      this.logger.error(logMessage, log);
    } else {
      this.logger.warn(logMessage, log);
    }

    httpAdapter.reply(
      response,
      buildExceptionResponse(httpStatus, message, request.requestId),
      httpStatus,
    );
  }
}
