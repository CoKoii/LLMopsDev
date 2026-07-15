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
