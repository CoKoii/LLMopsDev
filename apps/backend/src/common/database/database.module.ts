import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createTypeOrmOptions } from "./database.config";
import { DatabaseErrorMapper } from "./database-error.mapper";

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
  ],
  providers: [DatabaseErrorMapper],
  exports: [DatabaseErrorMapper],
})
export class DatabaseModule {}
