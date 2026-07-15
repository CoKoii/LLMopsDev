import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  StreamableFile,
} from "@nestjs/common";
import { SkipResponseWrap } from "../../../common/http/skip-response-wrap.decorator";
import { ChatDto } from "./dto/chat.dto";
import { ChatService } from "./chat.service";

@Controller("ai")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // -------------------------
  // 普通对话
  @Post("chat")
  chat(@Body() dto: ChatDto) {
    return this.chatService.chat(dto.message);
  }
  // -------------------------

  // -------------------------
  // 流式对话
  @Post("chat/stream")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("Connection", "keep-alive")
  @SkipResponseWrap()
  streamChat(@Body() dto: ChatDto): StreamableFile {
    return new StreamableFile(
      this.chatService.createChatSseStream(dto.message),
      {
        type: "text/event-stream; charset=utf-8",
      },
    );
  }
  // -------------------------

  // -------------------------
  // 学习测试用
  @Post("learn")
  learn(@Body() dto: ChatDto) {
    return this.chatService.learn(dto.message);
  }
  // -------------------------
}
