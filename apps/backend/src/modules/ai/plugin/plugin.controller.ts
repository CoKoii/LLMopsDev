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
import { CreatePluginDto } from "./dto/create-plugin.dto";
import { QueryPluginsDto } from "./dto/query-plugins.dto";
import { UpdatePluginDto } from "./dto/update-plugin.dto";
import { PluginService } from "./plugin.service";

@Controller("ai/plugins")
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  // -------------------------
  // 创建插件
  @Post()
  create(
    @Body() createPluginDto: CreatePluginDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pluginService.create(createPluginDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取插件列表
  @Get()
  list(@Query() query: QueryPluginsDto) {
    return this.pluginService.list(query);
  }
  // -------------------------

  // -------------------------
  // 获取插件分类
  @Get("categories")
  listCategories() {
    return this.pluginService.listCategories();
  }
  // -------------------------

  // -------------------------
  // 获取插件详情
  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.pluginService.findOne(id);
  }
  // -------------------------

  // -------------------------
  // 更新插件
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updatePluginDto: UpdatePluginDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pluginService.update(id, updatePluginDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 删除插件
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.pluginService.remove(id);
  }
  // -------------------------
}
