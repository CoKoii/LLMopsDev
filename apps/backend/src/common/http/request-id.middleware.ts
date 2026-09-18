import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export type RequestWithRequestId = Request & {
  requestId?: string;
};

const REQUEST_ID_HEADER = "x-request-id";

const resolveRequestId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : randomUUID();

export const requestIdMiddleware = (
  request: RequestWithRequestId,
  response: Response,
  next: NextFunction,
) => {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
