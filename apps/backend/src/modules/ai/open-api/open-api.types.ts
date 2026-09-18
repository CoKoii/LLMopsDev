import type { Request } from "express";

export type OpenApiPrincipal = {
  keyId: number;
  userId: number;
};

export type RequestWithOpenApiPrincipal = Request & {
  openApiPrincipal: OpenApiPrincipal;
};
