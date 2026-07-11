import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  type AuthUser,
  type RefreshTokenUser,
} from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { JwtRefreshGuard } from "../../../common/auth/jwt-refresh.guard";
import { Public } from "../../../common/auth/public.decorator";
import { AuthService } from "./auth.service";
import type { AuthRequestContext, AuthTokens } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const resolveHeaderValue = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : (value?.[0] ?? "");

const createAuthRequestContext = (request: Request): AuthRequestContext => ({
  ip: request.ip || "",
  userAgent: resolveHeaderValue(request.headers["user-agent"]),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // -------------------------
  // 登录
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthTokens> {
    return this.authService.login(dto, createAuthRequestContext(request));
  }
  // -------------------------

  // -------------------------
  // 注册
  @Public()
  @Post("register")
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<AuthTokens> {
    return this.authService.register(dto, createAuthRequestContext(request));
  }
  // -------------------------

  // -------------------------
  // 刷新令牌
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  refresh(
    @CurrentUser() user: RefreshTokenUser,
    @Req() request: Request,
  ): Promise<AuthTokens> {
    return this.authService.refresh(user, createAuthRequestContext(request));
  }
  // -------------------------

  // -------------------------
  // 退出登录
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  logout(@CurrentUser() user: AuthUser): Promise<{ success: true }> {
    return this.authService.logout(user);
  }
  // -------------------------

  // -------------------------
  // 退出全部登录会话
  @HttpCode(HttpStatus.OK)
  @Post("logout-all")
  logoutAll(@CurrentUser() user: AuthUser): Promise<{ success: true }> {
    return this.authService.logoutAll(user);
  }
  // -------------------------
}
