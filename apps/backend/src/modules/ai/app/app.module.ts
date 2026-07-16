import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AiAppVersion } from "./entities/app-version.entity";
import { AiApp } from "./entities/app.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AiApp, AiAppVersion]), FilesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
