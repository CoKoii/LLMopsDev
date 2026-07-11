import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WinstonModule } from "nest-winston";
import { createWinstonLoggerOptions } from "./logging.config";

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createWinstonLoggerOptions,
    }),
  ],
  exports: [WinstonModule],
})
export class LoggingModule {}
