import { Module } from "@nestjs/common";
import { ChatModule } from "./chat/chat.module";
import { AppModule } from "./app/app.module";
import { PluginModule } from "./plugin/plugin.module";
import { WorkflowModule } from "./workflow/workflow.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ChatModule,
    AppModule,
    PluginModule,
    WorkflowModule,
    KnowledgeModule,
    LlmModule,
  ],
})
export class AiModule {}
