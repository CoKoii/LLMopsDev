import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { Plugin } from "./entities/plugin.entity";
import { PluginController } from "./plugin.controller";
import { PluginService } from "./plugin.service";

@Module({
  imports: [TypeOrmModule.forFeature([Plugin]), FilesModule],
  controllers: [PluginController],
  providers: [PluginService],
})
export class PluginModule {}
