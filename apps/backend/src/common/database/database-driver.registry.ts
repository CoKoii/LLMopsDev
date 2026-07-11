import type { DatabaseType } from "../config/env";
import type { DatabaseDriver } from "./database.types";
import { createMysqlConnectionOptions } from "./drivers/mysql/config";
import { rethrowMySqlError } from "./drivers/mysql/errors";
import { createPostgresConnectionOptions } from "./drivers/postgres/config";
import { rethrowPostgresError } from "./drivers/postgres/errors";

const databaseDrivers = {
  mysql: {
    createConnectionOptions: createMysqlConnectionOptions,
    rethrowError: rethrowMySqlError,
  },
  postgres: {
    createConnectionOptions: createPostgresConnectionOptions,
    rethrowError: rethrowPostgresError,
  },
} satisfies Record<DatabaseType, DatabaseDriver>;

export const getDatabaseDriver = (type: DatabaseType): DatabaseDriver =>
  databaseDrivers[type];
