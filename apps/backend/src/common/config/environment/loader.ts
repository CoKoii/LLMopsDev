import type { ConfigService } from "@nestjs/config";
import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAiEnvironment } from "./ai.env";
import { createAppEnvironment } from "./app.env";
import { createAuthEnvironment } from "./auth.env";
import { createDatabaseEnvironment } from "./database.env";
import { ENV } from "./keys";
import { createLoggingEnvironment } from "./logging.env";
import { createMailEnvironment } from "./mail.env";
import { createOssEnvironment } from "./oss.env";
import { createRedisEnvironment } from "./redis.env";
import { getRequiredNodeEnv } from "./readers";
import { validateEnvironment } from "./schema";

const readEnvFile = (filePath: string): Record<string, string> =>
  existsSync(filePath) ? dotenv.parse(readFileSync(filePath)) : {};

const readProcessEnvironment = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

const resolveRuntimeNodeEnv = (nodeEnv = process.env.NODE_ENV) =>
  getRequiredNodeEnv(nodeEnv, ENV.NODE_ENV);

const resolveEnvFiles = (nodeEnv = resolveRuntimeNodeEnv()) => [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), `.env.${nodeEnv}`),
];

const withConfigService =
  (configService: Pick<ConfigService, "get">) =>
  (key: string): unknown =>
    configService.get(key);

let validatedProcessEnvironment: Record<string, unknown> | null = null;

const withProcessEnvironment = (key: string): unknown => {
  validatedProcessEnvironment ??= validateEnvironment(readProcessEnvironment());
  return validatedProcessEnvironment[key];
};

export const resolveEnvFilePaths = (nodeEnv = resolveRuntimeNodeEnv()) =>
  [...resolveEnvFiles(nodeEnv)].reverse();

export const loadEnvironmentFiles = (nodeEnv = resolveRuntimeNodeEnv()) => {
  const [baseEnvPath, environmentEnvPath] = resolveEnvFiles(nodeEnv);

  Object.assign(process.env, {
    ...readEnvFile(baseEnvPath),
    ...readEnvFile(environmentEnvPath),
    ...readProcessEnvironment(),
  });
};

export const getAppEnvironment = (configService: Pick<ConfigService, "get">) =>
  createAppEnvironment(withConfigService(configService));

export const getAppEnvironmentFromProcess = () =>
  createAppEnvironment(withProcessEnvironment);

export const getDatabaseEnvironment = (
  configService: Pick<ConfigService, "get">,
) => createDatabaseEnvironment(withConfigService(configService));

export const getDatabaseEnvironmentFromProcess = () =>
  createDatabaseEnvironment(withProcessEnvironment);

export const getRedisEnvironment = (
  configService: Pick<ConfigService, "get">,
) => createRedisEnvironment(withConfigService(configService));

export const getAiEnvironment = (configService: Pick<ConfigService, "get">) =>
  createAiEnvironment(withConfigService(configService));

export const getAiEnvironmentFromProcess = () =>
  createAiEnvironment(withProcessEnvironment);

export const getMailEnvironment = (configService: Pick<ConfigService, "get">) =>
  createMailEnvironment(withConfigService(configService));

export const getOssEnvironment = (configService: Pick<ConfigService, "get">) =>
  createOssEnvironment(withConfigService(configService));

export const getAuthEnvironment = (configService: Pick<ConfigService, "get">) =>
  createAuthEnvironment(withConfigService(configService));

export const getLoggingEnvironment = (
  configService: Pick<ConfigService, "get">,
) => createLoggingEnvironment(withConfigService(configService));
