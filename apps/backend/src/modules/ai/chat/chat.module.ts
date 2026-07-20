import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiAppVersion } from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import { Llm } from "../llm/entities/llm.entity";
import { PluginModule } from "../plugin/plugin.module";
import { AiRuntimeService } from "./ai-runtime.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [TypeOrmModule.forFeature([AiApp, AiAppVersion, Llm]), PluginModule],
  controllers: [ChatController],
  providers: [AiRuntimeService, ChatService],
})
export class ChatModule {}
