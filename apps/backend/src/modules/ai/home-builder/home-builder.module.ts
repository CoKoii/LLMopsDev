import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppModule } from "../app/app.module";
import { AiAppCategory } from "../app/entities/app-category.entity";
import { Knowledge } from "../knowledge/entities/knowledge.entity";
import { Llm } from "../llm/entities/llm.entity";
import { LlmModule } from "../llm/llm.module";
import { PluginModule } from "../plugin/plugin.module";
import { PluginCategory } from "../plugin/entities/plugin-category.entity";
import { Plugin } from "../plugin/entities/plugin.entity";
import { HomeBuilderController } from "./home-builder.controller";
import { HomeBuilderToolFactory } from "./home-builder-tool.factory";
import { HomeBuilderService } from "./home-builder.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiAppCategory,
      PluginCategory,
      Llm,
      Plugin,
      Knowledge,
    ]),
    AppModule,
    LlmModule,
    PluginModule,
  ],
  controllers: [HomeBuilderController],
  providers: [HomeBuilderService, HomeBuilderToolFactory],
})
export class HomeBuilderModule {}
