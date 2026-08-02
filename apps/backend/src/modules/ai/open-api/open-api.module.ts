import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../iam/users/user.entity";
import { ChatModule } from "../chat/chat.module";
import { OpenApiKey } from "./entities/open-api-key.entity";
import { OpenApiController } from "./open-api.controller";
import { OpenApiKeyGuard } from "./open-api-key.guard";
import { OpenApiKeyService } from "./open-api-key.service";

@Module({
  imports: [TypeOrmModule.forFeature([OpenApiKey, User]), ChatModule],
  controllers: [OpenApiController],
  providers: [OpenApiKeyService, OpenApiKeyGuard],
})
export class OpenApiModule {}
