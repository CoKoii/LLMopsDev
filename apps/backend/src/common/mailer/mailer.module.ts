import { MailerModule as NestMailerModule } from "@nestjs-modules/mailer";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createMailerOptions } from "./mailer.config";
import { AppMailerService } from "./mailer.service";

@Global()
@Module({
  imports: [
    NestMailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createMailerOptions,
    }),
  ],
  providers: [AppMailerService],
  exports: [NestMailerModule, AppMailerService],
})
export class AppMailerModule {}
