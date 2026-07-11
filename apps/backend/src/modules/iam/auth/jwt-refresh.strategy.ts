import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import {
  REFRESH_TOKEN_TYPE,
  type RefreshTokenPayload,
  type RefreshTokenUser,
  toRefreshTokenUser,
} from "../../../common/auth/auth-user";
import { getAuthEnvironment } from "../../../common/config/env";

const extractBearerToken = (authorization: string | string[] | undefined) => {
  const value =
    typeof authorization === "string" ? authorization : authorization?.[0];
  if (!value?.startsWith("Bearer ")) {
    return null;
  }
  return value.slice(7);
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor(configService: ConfigService) {
    const authEnvironment = getAuthEnvironment(configService);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authEnvironment.refreshTokenSecret,
      passReqToCallback: true,
    });
  }

  validate(request: Request, payload: RefreshTokenPayload): RefreshTokenUser {
    if (payload.type !== REFRESH_TOKEN_TYPE || !payload.sid.trim()) {
      throw new UnauthorizedException("刷新令牌无效或已过期");
    }

    const refreshToken = extractBearerToken(request.headers.authorization);
    if (!refreshToken) {
      throw new UnauthorizedException("刷新令牌无效或已过期");
    }

    return toRefreshTokenUser(payload, refreshToken);
  }
}
