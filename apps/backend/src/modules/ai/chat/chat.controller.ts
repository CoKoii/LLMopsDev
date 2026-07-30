import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
  Put,
} from "@nestjs/common";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import type { AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { ChatService } from "./chat.service";
import { ChatMemoryService } from "./chat-memory.service";
import { DebugAppChatDto } from "./dto/debug-app-chat.dto";
import { OptimizeAppPromptDto } from "./dto/optimize-app-prompt.dto";
import { TranscribeAppAudioDto } from "./dto/transcribe-app-audio.dto";
import { UpdateChatMemoryDto } from "./dto/update-chat-memory.dto";

@Controller("ai/apps")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatMemoryService: ChatMemoryService,
  ) {}

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
        dto.sessionId,
        dto.attachmentFileIds,
      ),
      {
        type: "text/event-stream; charset=utf-8",
      },
    );
  }
  // -------------------------

  // -------------------------
  // 调试AI应用语音输入识别
  @Post(":id/speech/transcriptions")
  transcribeSpeech(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: TranscribeAppAudioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.transcribeAppSpeech(id, dto.fileId, user.userId);
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
    @CurrentUser() user: AuthUser,
  ): StreamableFile {
    return new StreamableFile(
      this.chatService.createPromptOptimizeSseStream(
        id,
        dto.prompt,
        user.userId,
      ),
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
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.optimizePrompt(id, dto.prompt, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取AI应用长期记忆
  @Get(":id/memory")
  getMemory(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatMemoryService.getMemory(id, user.userId);
  }
  // -------------------------

  // -------------------------
  // 更新AI应用长期记忆
  @Put(":id/memory")
  updateMemory(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateChatMemoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatMemoryService.updateManualMemory(
      id,
      user.userId,
      dto.content,
    );
  }
  // -------------------------
}
