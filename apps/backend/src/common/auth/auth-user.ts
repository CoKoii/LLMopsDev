import type { Request } from "express";

export const ACCESS_TOKEN_TYPE = "access";
export const REFRESH_TOKEN_TYPE = "refresh";

export type TokenType = typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE;

interface BaseTokenPayload {
  sub: number;
  sid: string;
  type: TokenType;
}

export interface AuthTokenPayload extends BaseTokenPayload {
  type: typeof ACCESS_TOKEN_TYPE;
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  type: typeof REFRESH_TOKEN_TYPE;
}

export type JwtTokenPayload = AuthTokenPayload | RefreshTokenPayload;

export interface AuthUser {
  userId: number;
  sessionId: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface RefreshTokenUser {
  userId: number;
  sessionId: string;
  refreshToken: string;
}

export type RequestWithUser<TUser = AuthUser> = Omit<Request, "user"> & {
  user: TUser;
};

export const toRefreshTokenUser = (
  { sub, sid }: RefreshTokenPayload,
  refreshToken: string,
): RefreshTokenUser => ({
  userId: sub,
  sessionId: sid,
  refreshToken,
});
