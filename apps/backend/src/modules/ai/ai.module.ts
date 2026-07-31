import { Module } from "@nestjs/common";
import { AppModule } from "./app/app.module";
import { ChatModule } from "./chat/chat.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { LlmModule } from "./llm/llm.module";
import { PluginModule } from "./plugin/plugin.module";

@Module({
  imports: [AppModule, ChatModule, PluginModule, KnowledgeModule, LlmModule],
})
export class AiModule {}
