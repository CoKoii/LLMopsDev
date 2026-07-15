import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { PermissionsGuard } from "./common/auth/permissions.guard";
import { RolesGuard } from "./common/auth/roles.guard";
import { RedisModule } from "./common/cache/redis.module";
import {
  getAiEnvironmentFromProcess,
  loadEnvironmentFiles,
  resolveEnvFilePaths,
  validateEnvironment,
} from "./common/config/env";
import { DatabaseModule } from "./common/database/database.module";
import { AllExceptionFilter } from "./common/http/exception.filter";
import { ResponseInterceptor } from "./common/http/response.interceptor";
import { LoggingModule } from "./common/logging/logging.module";
import { AppMailerModule } from "./common/mailer/mailer.module";
import { OssModule } from "./common/oss/oss.module";
import { RequestContextInterceptor } from "./common/request-context/request-context.interceptor";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { AiModule } from "./modules/ai/ai.module";
import { ChatModule } from "./modules/ai/chat/chat.module";
import { FilesModule } from "./modules/files/files.module";
import { IamModule } from "./modules/iam/iam.module";

loadEnvironmentFiles();
const aiChatModuleImports = getAiEnvironmentFromProcess().enabled
  ? [ChatModule]
  : [];
const coreModules = [
  ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    envFilePath: resolveEnvFilePaths(),
    validate: validateEnvironment,
  }),
  ScheduleModule.forRoot(),
  RequestContextModule,
  LoggingModule,
  DatabaseModule,
  RedisModule,
];
const optionalModules = [AppMailerModule, OssModule, ...aiChatModuleImports];
const businessModules = [IamModule, FilesModule, AiModule];

@Module({
  imports: [...coreModules, ...optionalModules, ...businessModules],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
