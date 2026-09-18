import { ENV } from "./keys";
import {
  getExplicitOptionalString,
  getRequiredBoolean,
  getRequiredNumber,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

export const createMailEnvironment = (get: EnvironmentGetter) => ({
  enabled: getRequiredBoolean(get(ENV.MAIL_ENABLED), ENV.MAIL_ENABLED),
  host: getExplicitOptionalString(get(ENV.MAIL_HOST), ENV.MAIL_HOST),
  port: getRequiredNumber(get(ENV.MAIL_PORT), ENV.MAIL_PORT),
  secure: getRequiredBoolean(get(ENV.MAIL_SECURE), ENV.MAIL_SECURE),
  ignoreTls: getRequiredBoolean(get(ENV.MAIL_IGNORE_TLS), ENV.MAIL_IGNORE_TLS),
  user: getExplicitOptionalString(get(ENV.MAIL_USER), ENV.MAIL_USER),
  pass: getExplicitOptionalString(get(ENV.MAIL_PASS), ENV.MAIL_PASS),
  fromName: getRequiredString(get(ENV.MAIL_FROM_NAME), ENV.MAIL_FROM_NAME),
  fromAddress: getExplicitOptionalString(
    get(ENV.MAIL_FROM_ADDRESS),
    ENV.MAIL_FROM_ADDRESS,
  ),
});
