import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
} from "@nestjs/common";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import type { AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { ChatService } from "./chat.service";
import { DebugAppChatDto } from "./dto/debug-app-chat.dto";
import { OptimizeAppPromptDto } from "./dto/optimize-app-prompt.dto";

@Controller("ai/apps")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // -------------------------
  // 流式调试AI应用草稿
  @Post(":id/debug/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @SkipResponseWrap()
  debugStream(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DebugAppChatDto,
    @CurrentUser() user: AuthUser,
  ): StreamableFile {
    return new StreamableFile(
      this.chatService.createAppDebugSseStream(
        id,
        dto.message,
        user.userId,
        dto.history,
      ),
      {
        type: "text/event-stream; charset=utf-8",
      },
    );
  }
  // -------------------------

  // -------------------------
  // 流式优化AI应用草稿Prompt
  @Post(":id/prompt/optimize/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @SkipResponseWrap()
  optimizePromptStream(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: OptimizeAppPromptDto,
  ): StreamableFile {
    return new StreamableFile(
      this.chatService.createPromptOptimizeSseStream(id, dto.prompt),
      {
        type: "text/event-stream; charset=utf-8",
      },
    );
  }
  // -------------------------

  // -------------------------
  // 优化AI应用草稿Prompt
  @Post(":id/prompt/optimize")
  optimizePrompt(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: OptimizeAppPromptDto,
  ) {
    return this.chatService.optimizePrompt(id, dto.prompt);
  }
  // -------------------------
}
