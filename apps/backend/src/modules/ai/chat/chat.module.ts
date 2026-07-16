import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiAppVersion } from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import { Llm } from "../llm/entities/llm.entity";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [TypeOrmModule.forFeature([AiApp, AiAppVersion, Llm])],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
