import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";
import type { RequestWithRequestId } from "./request-id.middleware";
import { SKIP_RESPONSE_WRAP_KEY } from "./skip-response-wrap.decorator";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const skipResponseWrap = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipResponseWrap) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithRequestId>();

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        data,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
