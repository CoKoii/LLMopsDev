import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { DEVELOPMENT_NODE_ENV } from "../../../config/env";
import type { DatabaseConnectionContext } from "../../database.types";

export const createPostgresConnectionOptions = ({
  databaseEnvironment,
  entities,
  nodeEnv,
}: DatabaseConnectionContext): PostgresConnectionOptions => ({
  type: "postgres",
  host: databaseEnvironment.host,
  port: databaseEnvironment.port,
  username: databaseEnvironment.username,
  password: databaseEnvironment.password,
  database: databaseEnvironment.database,
  entities,
  synchronize: databaseEnvironment.synchronize,
  logging: nodeEnv === DEVELOPMENT_NODE_ENV,
});
