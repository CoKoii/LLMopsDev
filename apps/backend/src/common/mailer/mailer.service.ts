import { MailerService, type ISendMailOptions } from "@nestjs-modules/mailer";
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SentMessageInfo } from "nodemailer";
import { getMailEnvironment } from "../config/env";

export interface TemplateMailOptions<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<ISendMailOptions, "context" | "template"> {
  template: string;
  context: TContext;
}

@Injectable()
export class AppMailerService {
  private readonly logger = new Logger(AppMailerService.name);
  private readonly mailEnabled: boolean;

  constructor(
    private readonly mailerService: MailerService,
    configService: ConfigService,
  ) {
    this.mailEnabled = getMailEnvironment(configService).enabled;
  }

  isEnabled() {
    return this.mailEnabled;
  }

  private ensureMailerEnabled() {
    if (this.mailEnabled) {
      return;
    }

    this.logger.warn("邮件服务未启用，已阻止发送邮件");
    throw new ServiceUnavailableException("邮件服务未启用");
  }

  sendMail(options: ISendMailOptions): Promise<SentMessageInfo> {
    this.ensureMailerEnabled();
    return this.mailerService.sendMail(options);
  }

  sendTemplateMail<TContext extends Record<string, unknown>>(
    options: TemplateMailOptions<TContext>,
  ): Promise<SentMessageInfo> {
    return this.sendMail(options);
  }
}
