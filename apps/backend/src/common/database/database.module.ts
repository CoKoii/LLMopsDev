import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestContextModule } from "../request-context/request-context.module";
import { AuditSubscriber } from "./audit.subscriber";
import { createTypeOrmOptions } from "./database.config";

@Global()
@Module({
  imports: [
    RequestContextModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
  ],
  providers: [AuditSubscriber],
})
export class DatabaseModule {}
