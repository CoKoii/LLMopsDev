import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import type { AuthUser } from "../../common/auth/auth-user";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";
import { FilesService } from "./files.service";

@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // -------------------------
  // 创建上传意图
  @Post("upload-intents")
  createUploadIntent(
    @Body() dto: CreateUploadIntentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.filesService.createUploadIntent(dto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 确认上传完成
  @HttpCode(HttpStatus.OK)
  @Post(":id/complete")
  complete(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.filesService.complete(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取文件详情
  @Get(":id")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.filesService.findOne(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 删除文件
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.filesService.remove(id, user.userId);
  }
  // -------------------------
}
