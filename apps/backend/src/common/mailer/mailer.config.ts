import { type MailerOptions } from "@nestjs-modules/mailer";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/adapters/handlebars.adapter";
import { ConfigService } from "@nestjs/config";
import { join } from "node:path";
import { getMailEnvironment } from "../config/env";

const templateDirectory = join(__dirname, "templates");

const ensureConfiguredValue = (value: string | undefined, key: string) => {
  if (!value) {
    throw new Error(`启用邮件服务时必须配置 ${key}`);
  }

  return value;
};

const resolveMailFrom = (
  mailEnvironment: ReturnType<typeof getMailEnvironment>,
) => {
  const fromAddress = ensureConfiguredValue(
    mailEnvironment.fromAddress,
    "MAIL_FROM_ADDRESS",
  );

  return mailEnvironment.fromName
    ? `"${mailEnvironment.fromName}" <${fromAddress}>`
    : fromAddress;
};

const createTransport = (
  mailEnvironment: ReturnType<typeof getMailEnvironment>,
): NonNullable<MailerOptions["transport"]> => {
  if (!mailEnvironment.enabled) {
    return { jsonTransport: true };
  }

  return {
    host: ensureConfiguredValue(mailEnvironment.host, "MAIL_HOST"),
    port: mailEnvironment.port,
    secure: mailEnvironment.secure,
    ignoreTLS: mailEnvironment.ignoreTls,
    ...(mailEnvironment.user
      ? {
          auth: {
            user: mailEnvironment.user,
            pass: mailEnvironment.pass ?? "",
          },
        }
      : {}),
  };
};

export const createMailerOptions = (
  configService: ConfigService,
): MailerOptions => {
  const mailEnvironment = getMailEnvironment(configService);

  return {
    transport: createTransport(mailEnvironment),
    defaults: mailEnvironment.fromAddress
      ? {
          from: resolveMailFrom(mailEnvironment),
        }
      : undefined,
    template: {
      dir: templateDirectory,
      adapter: new HandlebarsAdapter(),
      options: {
        strict: true,
      },
    },
  };
};
