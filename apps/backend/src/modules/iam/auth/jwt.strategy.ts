import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import {
  ACCESS_TOKEN_TYPE,
  type AuthTokenPayload,
  type AuthUser,
} from "../../../common/auth/auth-user";
import { getAuthEnvironment } from "../../../common/config/env";
import { AuthService } from "./auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const authEnvironment = getAuthEnvironment(configService);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authEnvironment.accessTokenSecret,
    });
  }

  async validate(payload: AuthTokenPayload): Promise<AuthUser> {
    if (payload.type !== ACCESS_TOKEN_TYPE || !payload.sid.trim()) {
      throw new UnauthorizedException("未登录或登录已过期");
    }

    return this.authService.resolveAuthUser(payload.sub, payload.sid);
  }
}
