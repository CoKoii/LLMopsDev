import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestWithOpenApiPrincipal } from "./open-api.types";

export const CurrentOpenApiPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithOpenApiPrincipal>()
      .openApiPrincipal,
);
