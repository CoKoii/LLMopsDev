import { Controller, Get } from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { ProfilesService } from "./profiles.service";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // -------------------------
  // 获取当前用户资料
  @Get("me")
  getCurrent(@CurrentUser() user: AuthUser) {
    return this.profilesService.getCurrent(user);
  }
  // -------------------------
}
