import { Module } from "@nestjs/common";
import { AppModule } from "./app/app.module";
import { ChatModule } from "./chat/chat.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { LlmModule } from "./llm/llm.module";
import { PluginModule } from "./plugin/plugin.module";
import { WorkflowModule } from "./workflow/workflow.module";

@Module({
  imports: [
    AppModule,
    ChatModule,
    PluginModule,
    WorkflowModule,
    KnowledgeModule,
    LlmModule,
  ],
})
export class AiModule {}
