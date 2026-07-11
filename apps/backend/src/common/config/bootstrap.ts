import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ValidationError } from "class-validator";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { getAppEnvironment } from "./env";
import { requestIdMiddleware } from "../http/request-id.middleware";

const API_GLOBAL_PREFIX = "api";
const DEFAULT_VALIDATION_MESSAGE = "参数校验失败";

const resolveFirstValidationMessage = (error: ValidationError): string => {
  if (error.constraints) {
    const [message] = Object.values(error.constraints);
    return message ?? DEFAULT_VALIDATION_MESSAGE;
  }

  const [firstChild] = error.children ?? [];
  return firstChild
    ? resolveFirstValidationMessage(firstChild)
    : DEFAULT_VALIDATION_MESSAGE;
};

const createValidationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    stopAtFirstError: true,
    exceptionFactory: (errors: ValidationError[]) => {
      if (!errors.length) {
        return new BadRequestException(DEFAULT_VALIDATION_MESSAGE);
      }

      return new BadRequestException(resolveFirstValidationMessage(errors[0]));
    },
  });

export const setupApplication = (app: INestApplication) => {
  const appEnvironment = getAppEnvironment(app.get(ConfigService));

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableCors({
    origin:
      appEnvironment.nodeEnv === "production"
        ? appEnvironment.corsOrigins.length
          ? appEnvironment.corsOrigins
          : false
        : true,
  });
  app.useGlobalPipes(createValidationPipe());
};

export const resolveApplicationPort = (app: INestApplication) =>
  getAppEnvironment(app.get(ConfigService)).port;
