import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { Public } from "../../../common/auth/public.decorator";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import { ChatService } from "../chat/chat.service";
import { CurrentOpenApiPrincipal } from "./current-open-api-principal.decorator";
import { CreateOpenApiKeyDto } from "./dto/create-open-api-key.dto";
import { OpenApiChatDto } from "./dto/open-api-chat.dto";
import { UpdateOpenApiKeyDto } from "./dto/update-open-api-key.dto";
import { OpenApiKeyGuard } from "./open-api-key.guard";
import { OpenApiKeyService } from "./open-api-key.service";
import type { OpenApiPrincipal } from "./open-api.types";

@Controller("openapi")
export class OpenApiController {
  constructor(
    private readonly keyService: OpenApiKeyService,
    private readonly chatService: ChatService,
  ) {}

  @Get("keys")
  listKeys(@CurrentUser() user: AuthUser) {
    return this.keyService.list(user.userId);
  }

  @Post("keys")
  createKey(@Body() dto: CreateOpenApiKeyDto, @CurrentUser() user: AuthUser) {
    return this.keyService.create(dto, user.userId);
  }

  @Patch("keys/:id")
  updateKey(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateOpenApiKeyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.keyService.update(id, dto, user.userId);
  }

  @Delete("keys/:id")
  removeKey(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.keyService.remove(id, user.userId);
  }

  @Public()
  @UseGuards(OpenApiKeyGuard)
  @Post("chat")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @SkipResponseWrap()
  chat(
    @Body() dto: OpenApiChatDto,
    @CurrentOpenApiPrincipal() principal: OpenApiPrincipal,
  ) {
    const params = {
      appId: dto.app_id,
      endUserId: dto.end_user_id.trim(),
      conversationId: dto.conversation_id?.trim() || undefined,
      message: dto.query,
      userId: principal.userId,
    };

    if (!dto.stream) return this.chatService.runOpenApiChat(params);

    return new StreamableFile(this.chatService.createOpenApiSseStream(params), {
      type: "text/event-stream; charset=utf-8",
    });
  }
}
