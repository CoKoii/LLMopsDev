export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthRequestContext {
  ip: string;
  userAgent: string;
}
