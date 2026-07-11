import type { ValidationResult } from "joi";
import * as Joi from "joi";
import { ENV, SUPPORTED_DATABASE_TYPES, SUPPORTED_NODE_ENVS } from "./keys";

export const validationSchema = Joi.object({
  [ENV.NODE_ENV]: Joi.string()
    .valid(...SUPPORTED_NODE_ENVS)
    .required(),
  [ENV.PORT]: Joi.number().port().required(),
  [ENV.CORS_ORIGINS]: Joi.string().allow("").required(),
  [ENV.DB_TYPE]: Joi.string()
    .valid(...SUPPORTED_DATABASE_TYPES)
    .required(),
  [ENV.LOG_ON]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.LOG_LEVEL]: Joi.string()
    .valid("error", "warn", "info", "http", "verbose", "debug", "silly")
    .required(),
  [ENV.DB_HOST]: Joi.string().required(),
  [ENV.DB_PORT]: Joi.number().port().required(),
  [ENV.DB_USERNAME]: Joi.string().required(),
  [ENV.DB_PASSWORD]: Joi.string().allow("").required(),
  [ENV.DB_DATABASE]: Joi.string().required(),
  [ENV.DB_SYNC]: Joi.when(ENV.NODE_ENV, {
    is: "production",
    then: Joi.boolean()
      .truthy("true")
      .falsy("false")
      .valid(false)
      .required()
      .messages({ "any.only": "生产环境禁止开启 DB_SYNC=true" }),
    otherwise: Joi.boolean().truthy("true").falsy("false").required(),
  }),
  [ENV.REDIS_HOST]: Joi.string().required(),
  [ENV.REDIS_PORT]: Joi.number().port().required(),
  [ENV.REDIS_USERNAME]: Joi.string().allow("").required(),
  [ENV.REDIS_PASSWORD]: Joi.string().allow("").required(),
  [ENV.REDIS_DB]: Joi.number().integer().min(0).required(),
  [ENV.REDIS_KEY_PREFIX]: Joi.string().allow("").required(),
  [ENV.AI_ENABLED]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.AI_API_KEY]: Joi.when(ENV.AI_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.AI_BASE_URL]: Joi.string().allow("").required(),
  [ENV.AI_CHAT_MODEL]: Joi.when(ENV.AI_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.AI_TEMPERATURE]: Joi.number().min(0).max(2).required(),
  [ENV.MAIL_ENABLED]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.MAIL_HOST]: Joi.when(ENV.MAIL_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.MAIL_PORT]: Joi.number().port().required(),
  [ENV.MAIL_SECURE]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.MAIL_IGNORE_TLS]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.MAIL_USER]: Joi.string().allow("").required(),
  [ENV.MAIL_PASS]: Joi.string().allow("").required(),
  [ENV.MAIL_FROM_NAME]: Joi.string().trim().required(),
  [ENV.MAIL_FROM_ADDRESS]: Joi.when(ENV.MAIL_ENABLED, {
    is: true,
    then: Joi.string()
      .trim()
      .email({ tlds: { allow: false } })
      .required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.OSS_ENABLED]: Joi.boolean().truthy("true").falsy("false").required(),
  [ENV.OSS_REGION]: Joi.string().trim().required(),
  [ENV.OSS_BUCKET]: Joi.when(ENV.OSS_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.OSS_ACCESS_KEY_ID]: Joi.when(ENV.OSS_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.OSS_ACCESS_KEY_SECRET]: Joi.when(ENV.OSS_ENABLED, {
    is: true,
    then: Joi.string().trim().required(),
    otherwise: Joi.string().allow("").required(),
  }),
  [ENV.OSS_PUBLIC_BASE_URL]: Joi.string().allow("").optional(),
  [ENV.OSS_UPLOAD_EXPIRES_IN]: Joi.number().integer().min(60).required(),
  [ENV.OSS_UPLOAD_MAX_SIZE]: Joi.number().integer().min(1).required(),
  [ENV.OSS_TEMP_EXPIRES_IN_HOURS]: Joi.number().integer().min(1).required(),
  [ENV.JWT_ACCESS_SECRET]: Joi.string().required(),
  [ENV.JWT_ACCESS_EXPIRES_IN]: Joi.string().trim().required(),
  [ENV.JWT_REFRESH_SECRET]: Joi.string().required(),
  [ENV.JWT_REFRESH_EXPIRES_IN]: Joi.string().trim().required(),
});

export const validateEnvironment = (
  environment: Record<string, unknown>,
): Record<string, unknown> => {
  const result: ValidationResult<Record<string, unknown>> =
    validationSchema.validate(environment, {
      abortEarly: false,
      allowUnknown: true,
    });

  if (result.error) {
    throw result.error;
  }

  return result.value;
};
