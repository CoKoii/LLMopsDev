import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { PluginCategory } from "./entities/plugin-category.entity";
import { Plugin } from "./entities/plugin.entity";
import { PluginController } from "./plugin.controller";
import { PluginService } from "./plugin.service";
import { PluginToolService } from "./plugin-tool.service";

@Module({
  imports: [TypeOrmModule.forFeature([Plugin, PluginCategory]), FilesModule],
  controllers: [PluginController],
  providers: [PluginService, PluginToolService],
  exports: [PluginService, PluginToolService],
})
export class PluginModule {}
