import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { Knowledge } from "../knowledge/entities/knowledge.entity";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { Llm } from "../llm/entities/llm.entity";
import { Plugin } from "../plugin/entities/plugin.entity";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AiAppCategory } from "./entities/app-category.entity";
import { AiAppVersion } from "./entities/app-version.entity";
import { AiApp } from "./entities/app.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiApp,
      AiAppCategory,
      AiAppVersion,
      Llm,
      Plugin,
      Knowledge,
    ]),
    FilesModule,
    KnowledgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [AppService],
})
export class AppModule {}
