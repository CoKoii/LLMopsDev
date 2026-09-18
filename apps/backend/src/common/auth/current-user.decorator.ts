import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestWithUser } from "./auth-user";

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);
