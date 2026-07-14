import { ConfigService } from "@nestjs/config";
import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "node:path";
import type { DataSourceOptions } from "typeorm";
import {
  type DatabaseEnvironment,
  getAppEnvironment,
  getAppEnvironmentFromProcess,
  getDatabaseEnvironment,
  getDatabaseEnvironmentFromProcess,
} from "../config/env";
import { createMysqlConnectionOptions } from "./drivers/mysql/config";
import { createPostgresConnectionOptions } from "./drivers/postgres/config";

const isTypeScriptRuntime = __filename.endsWith(".ts");
const runtimeExtension = isTypeScriptRuntime ? "ts" : "js";
const runtimeRoot = isTypeScriptRuntime
  ? join(process.cwd(), "src")
  : join(process.cwd(), "dist");
const entities = [join(runtimeRoot, "**", `*.entity.${runtimeExtension}`)];
const migrations = [join(runtimeRoot, "migrations", `*.${runtimeExtension}`)];

const createDatabaseOptions = (
  databaseEnvironment: DatabaseEnvironment,
  nodeEnv: string,
): DataSourceOptions => {
  const context = {
    databaseEnvironment,
    entities,
    nodeEnv,
  };

  switch (databaseEnvironment.type) {
    case "mysql":
      return createMysqlConnectionOptions(context);
    case "postgres":
      return createPostgresConnectionOptions(context);
  }
};

export const createTypeOrmOptions = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  ...createDatabaseOptions(
    getDatabaseEnvironment(configService),
    getAppEnvironment(configService).nodeEnv,
  ),
  autoLoadEntities: true,
});

export const createDataSourceOptions = (): DataSourceOptions => ({
  ...createDatabaseOptions(
    getDatabaseEnvironmentFromProcess(),
    getAppEnvironmentFromProcess().nodeEnv,
  ),
  migrations,
  subscribers: [],
});
