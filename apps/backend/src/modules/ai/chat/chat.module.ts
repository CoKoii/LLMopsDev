import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { AiAppVersion } from "../app/entities/app-version.entity";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { AiApp } from "../app/entities/app.entity";
import { Llm } from "../llm/entities/llm.entity";
import { PluginModule } from "../plugin/plugin.module";
import { AiRuntimeService } from "./ai-runtime.service";
import { ChatAttachmentService } from "./chat-attachment.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatAttachmentChunk } from "./entities/chat-attachment-chunk.entity";
import { ChatAttachment } from "./entities/chat-attachment.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { ChatSession } from "./entities/chat-session.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiApp,
      AiAppVersion,
      Llm,
      ChatSession,
      ChatMessage,
      ChatAttachment,
      ChatAttachmentChunk,
    ]),
    FilesModule,
    PluginModule,
    KnowledgeModule,
  ],
  controllers: [ChatController],
  providers: [AiRuntimeService, ChatService, ChatAttachmentService],
})
export class ChatModule {}
