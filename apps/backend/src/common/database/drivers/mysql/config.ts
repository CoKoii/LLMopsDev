import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import { DEVELOPMENT_NODE_ENV } from "../../../config/env";
import type { DatabaseConnectionContext } from "../../database.types";

export const createMysqlConnectionOptions = ({
  databaseEnvironment,
  entities,
  nodeEnv,
}: DatabaseConnectionContext): MysqlConnectionOptions => ({
  type: "mysql",
  host: databaseEnvironment.host,
  port: databaseEnvironment.port,
  username: databaseEnvironment.username,
  password: databaseEnvironment.password,
  database: databaseEnvironment.database,
  entities,
  synchronize: databaseEnvironment.synchronize,
  logging: nodeEnv === DEVELOPMENT_NODE_ENV,
});
