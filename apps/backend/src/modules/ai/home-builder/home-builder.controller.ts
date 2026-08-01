import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  StreamableFile,
} from "@nestjs/common";
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import { CreateHomeBuilderPlanDto } from "./dto/create-home-builder-plan.dto";
import { HomeBuilderService } from "./home-builder.service";

@Controller("ai/home-builder")
export class HomeBuilderController {
  constructor(private readonly homeBuilderService: HomeBuilderService) {}

  @Post("plans")
  createPlan(
    @Body() dto: CreateHomeBuilderPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.homeBuilderService.createPlan(dto, user.userId);
  }

  @Post("plans/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @SkipResponseWrap()
  createPlanStream(
    @Body() dto: CreateHomeBuilderPlanDto,
    @CurrentUser() user: AuthUser,
  ): StreamableFile {
    return new StreamableFile(
      this.homeBuilderService.createPlanSseStream(dto, user.userId),
      {
        type: "text/event-stream; charset=utf-8",
      },
    );
  }
}
