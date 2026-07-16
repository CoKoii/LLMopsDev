import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { AppService } from "./app.service";
import { CreateAppDto } from "./dto/create-app.dto";
import { QueryAppsDto } from "./dto/query-apps.dto";
import { UpdateAppDraftDto } from "./dto/update-app-draft.dto";
import { UpdateAppDto } from "./dto/update-app.dto";

@Controller("ai/apps")
export class AppController {
  constructor(private readonly appService: AppService) {}

  // -------------------------
  // 创建AI应用
  @Post()
  create(@Body() createAppDto: CreateAppDto, @CurrentUser() user: AuthUser) {
    return this.appService.create(createAppDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用列表
  @Get()
  list(@Query() query: QueryAppsDto) {
    return this.appService.list(query);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用详情
  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.appService.findOne(id);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用草稿版本
  @Get(":id/draft")
  getDraft(@Param("id", ParseIntPipe) id: number) {
    return this.appService.getDraft(id);
  }
  // -------------------------

  // -------------------------
  // 自动保存AI应用草稿版本
  @Put(":id/draft")
  updateDraft(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateAppDraftDto: UpdateAppDraftDto,
  ) {
    return this.appService.updateDraft(id, updateAppDraftDto);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用历史版本
  @Get(":id/versions")
  listVersions(@Param("id", ParseIntPipe) id: number) {
    return this.appService.listVersions(id);
  }
  // -------------------------

  // -------------------------
  // 发布AI应用版本
  @Post(":id/versions/publish")
  publishVersion(@Param("id", ParseIntPipe) id: number) {
    return this.appService.publishVersion(id);
  }
  // -------------------------

  // -------------------------
  // 恢复历史版本到草稿
  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @Param("id", ParseIntPipe) id: number,
    @Param("versionId", ParseIntPipe) versionId: number,
  ) {
    return this.appService.restoreVersion(id, versionId);
  }
  // -------------------------

  // -------------------------
  // 更新AI应用
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateAppDto: UpdateAppDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.update(id, updateAppDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 删除AI应用
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.appService.remove(id);
  }
  // -------------------------
}
