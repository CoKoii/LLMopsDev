import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { BuiltinPluginToolService } from "./builtin/builtin-plugin-tool.service";
import { PluginCategory } from "./entities/plugin-category.entity";
import { Plugin } from "./entities/plugin.entity";
import { PluginController } from "./plugin.controller";
import { PluginService } from "./plugin.service";

@Module({
  imports: [TypeOrmModule.forFeature([Plugin, PluginCategory]), FilesModule],
  controllers: [PluginController],
  providers: [PluginService, BuiltinPluginToolService],
  exports: [BuiltinPluginToolService],
})
export class PluginModule {}
