import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import { CreateHomeBuilderPlanDto } from "./dto/create-home-builder-plan.dto";
import { HomeBuilderService } from "./home-builder.service";

@Controller("ai/home-builder")
export class HomeBuilderController {
  constructor(private readonly homeBuilderService: HomeBuilderService) {}

  @Post("plans/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @Header("X-Accel-Buffering", "no")
  @SkipResponseWrap()
  createPlanStream(
    @Body() dto: CreateHomeBuilderPlanDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const controller = new AbortController();
    const stream = this.homeBuilderService.createPlanSseStream(
      dto,
      user.userId,
      controller.signal,
    );
    response.once("close", () => {
      if (response.writableFinished || controller.signal.aborted) return;
      // Cancel the LangChain stream before destroying its downstream reader.
      controller.abort();
      stream.destroy();
    });
    return new StreamableFile(stream, {
      type: "text/event-stream; charset=utf-8",
    });
  }
}
