import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { AiAppVersion } from "../app/entities/app-version.entity";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { AiApp } from "../app/entities/app.entity";
import { LlmModule } from "../llm/llm.module";
import { PluginModule } from "../plugin/plugin.module";
import { AiRuntimeService } from "./ai-runtime.service";
import { ChatAttachmentService } from "./chat-attachment.service";
import { ChatController } from "./chat.controller";
import { ChatMemoryProcessor } from "./chat-memory.processor";
import { ChatMemoryQueueService } from "./chat-memory-queue.service";
import { ChatMemoryService } from "./chat-memory.service";
import { ChatService } from "./chat.service";
import { ChatAttachmentChunk } from "./entities/chat-attachment-chunk.entity";
import { ChatAttachment } from "./entities/chat-attachment.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { ChatSessionSummary } from "./entities/chat-session-summary.entity";
import { ChatSession } from "./entities/chat-session.entity";
import { ChatUserMemory } from "./entities/chat-user-memory.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiApp,
      AiAppVersion,
      ChatSession,
      ChatMessage,
      ChatAttachment,
      ChatAttachmentChunk,
      ChatSessionSummary,
      ChatUserMemory,
    ]),
    FilesModule,
    PluginModule,
    KnowledgeModule,
    LlmModule,
  ],
  controllers: [ChatController],
  providers: [
    AiRuntimeService,
    ChatService,
    ChatAttachmentService,
    ChatMemoryService,
    ChatMemoryQueueService,
    ChatMemoryProcessor,
  ],
  exports: [ChatService],
})
export class ChatModule {}
