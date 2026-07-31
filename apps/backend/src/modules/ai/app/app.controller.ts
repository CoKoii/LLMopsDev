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
  list(@Query() query: QueryAppsDto, @CurrentUser() user: AuthUser) {
    return this.appService.list(query, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用分类
  @Get("categories")
  listCategories() {
    return this.appService.listCategories();
  }
  // -------------------------

  // -------------------------
  // 获取AI应用详情
  @Get(":id")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.findOne(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用发布配置
  @Get(":id/publish-config")
  getPublishConfig(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.getPublishConfig(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 公开AI应用独立对话页
  @Post(":id/publish-config/publish")
  publishApp(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.publishApp(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 取消公开AI应用独立对话页
  @Post(":id/publish-config/unpublish")
  unpublishApp(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.unpublishApp(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用独立对话页元信息
  @Get(":id/standalone")
  getStandaloneApp(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.getStandaloneApp(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用草稿版本
  @Get(":id/draft")
  getDraft(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.getDraft(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 自动保存AI应用草稿版本
  @Put(":id/draft")
  updateDraft(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateAppDraftDto: UpdateAppDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.updateDraft(id, updateAppDraftDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用历史版本
  @Get(":id/versions")
  listVersions(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.listVersions(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 发布AI应用版本
  @Post(":id/versions/publish")
  publishVersion(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.publishVersion(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 设置独立对话页使用的历史版本
  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @Param("id", ParseIntPipe) id: number,
    @Param("versionId", ParseIntPipe) versionId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appService.restoreVersion(id, versionId, user.userId);
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
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.appService.remove(id, user.userId);
  }
  // -------------------------
}
