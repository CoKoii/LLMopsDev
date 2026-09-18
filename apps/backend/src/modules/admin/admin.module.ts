import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiAppCategory } from "../ai/app/entities/app-category.entity";
import { AiApp } from "../ai/app/entities/app.entity";
import { ChatMessage } from "../ai/chat/entities/chat-message.entity";
import { ChatSession } from "../ai/chat/entities/chat-session.entity";
import { KnowledgeDocumentChunk } from "../ai/knowledge/entities/knowledge-document-chunk.entity";
import { KnowledgeDocument } from "../ai/knowledge/entities/knowledge-document.entity";
import { Knowledge } from "../ai/knowledge/entities/knowledge.entity";
import { Llm } from "../ai/llm/entities/llm.entity";
import { PluginCategory } from "../ai/plugin/entities/plugin-category.entity";
import { Plugin } from "../ai/plugin/entities/plugin.entity";
import { User } from "../iam/users/user.entity";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AiApp,
      AiAppCategory,
      Plugin,
      PluginCategory,
      Knowledge,
      KnowledgeDocument,
      KnowledgeDocumentChunk,
      Llm,
      ChatSession,
      ChatMessage,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
