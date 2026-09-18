import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtRefreshGuard extends AuthGuard("jwt-refresh") {
  handleRequest<TUser>(err: unknown, user: TUser | false | null): TUser {
    if (err instanceof Error) {
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException("刷新令牌无效或已过期");
    }
    return user;
  }
}
