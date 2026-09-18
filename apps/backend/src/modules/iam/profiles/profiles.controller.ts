import { Body, Controller, Get, Put } from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { ChangeCurrentPasswordDto } from "./dto/change-current-password.dto";
import { UpdateCurrentProfileDto } from "./dto/update-current-profile.dto";
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

  // -------------------------
  // 更新当前用户资料
  @Put("me")
  updateCurrent(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCurrentProfileDto,
  ) {
    return this.profilesService.updateCurrent(user, dto);
  }
  // -------------------------

  // -------------------------
  // 修改当前用户密码
  @Put("me/password")
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeCurrentPasswordDto,
  ) {
    return this.profilesService.changePassword(user, dto);
  }
  // -------------------------
}
