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
  Query,
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
import { QueryAppStatsDto } from "./dto/query-app-stats.dto";
import { QueryStandaloneChatDto } from "./dto/query-standalone-chat.dto";
import { TranscribeAppAudioDto } from "./dto/transcribe-app-audio.dto";
import { UpdateChatMemoryDto } from "./dto/update-chat-memory.dto";
import { UpdateStandaloneSessionDto } from "./dto/update-standalone-session.dto";

@Controller("ai/apps")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatMemoryService: ChatMemoryService,
  ) {}

  // -------------------------
  // 获取AI应用统计分析
  @Get(":id/stats")
  getAppStats(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: QueryAppStatsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.getAppStats(id, user.userId, query.days);
  }
  // -------------------------

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
  // 获取AI应用独立页会话列表
  @Get(":id/standalone/sessions")
  listStandaloneSessions(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: QueryStandaloneChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.listStandaloneSessions(id, user.userId, query);
  }
  // -------------------------

  // -------------------------
  // 重命名AI应用独立页会话
  @Patch(":id/standalone/sessions/:sessionId")
  updateStandaloneSession(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId", ParseIntPipe) sessionId: number,
    @Body() dto: UpdateStandaloneSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.updateStandaloneSession(
      id,
      sessionId,
      user.userId,
      dto,
    );
  }
  // -------------------------

  // -------------------------
  // 删除AI应用独立页会话
  @Delete(":id/standalone/sessions/:sessionId")
  deleteStandaloneSession(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId", ParseIntPipe) sessionId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.deleteStandaloneSession(id, sessionId, user.userId);
  }
  // -------------------------

  // -------------------------
  // 置顶AI应用独立页会话
  @Post(":id/standalone/sessions/:sessionId/pin")
  pinStandaloneSession(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId", ParseIntPipe) sessionId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.setStandaloneSessionPinned(
      id,
      sessionId,
      user.userId,
      true,
    );
  }
  // -------------------------

  // -------------------------
  // 取消置顶AI应用独立页会话
  @Post(":id/standalone/sessions/:sessionId/unpin")
  unpinStandaloneSession(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId", ParseIntPipe) sessionId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.setStandaloneSessionPinned(
      id,
      sessionId,
      user.userId,
      false,
    );
  }
  // -------------------------

  // -------------------------
  // 获取AI应用独立页会话消息
  @Get(":id/standalone/sessions/:sessionId/messages")
  listStandaloneSessionMessages(
    @Param("id", ParseIntPipe) id: number,
    @Param("sessionId", ParseIntPipe) sessionId: number,
    @Query() query: QueryStandaloneChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.listStandaloneSessionMessages(
      id,
      sessionId,
      user.userId,
      query,
    );
  }
  // -------------------------

  // -------------------------
  // 流式对话AI应用独立页版本
  @Post(":id/standalone/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @SkipResponseWrap()
  standaloneStream(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DebugAppChatDto,
    @CurrentUser() user: AuthUser,
  ): StreamableFile {
    return new StreamableFile(
      this.chatService.createStandaloneAppSseStream(
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
  // 独立页AI应用语音输入识别
  @Post(":id/standalone/speech/transcriptions")
  transcribeStandaloneSpeech(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: TranscribeAppAudioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.transcribeStandaloneAppSpeech(
      id,
      dto.fileId,
      user.userId,
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
