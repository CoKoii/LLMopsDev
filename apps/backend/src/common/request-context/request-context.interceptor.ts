import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthUser } from "../auth/auth-user";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = request.user?.userId;

    return new Observable((subscriber) =>
      this.requestContext.run({ userId }, () => {
        const subscription = next.handle().subscribe(subscriber);

        return () => subscription.unsubscribe();
      }),
    );
  }
}
