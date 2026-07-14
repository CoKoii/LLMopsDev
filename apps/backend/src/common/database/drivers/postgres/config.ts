import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import {
  DEVELOPMENT_NODE_ENV,
  type DatabaseEnvironment,
} from "../../../config/env";

type DatabaseConnectionContext = {
  databaseEnvironment: DatabaseEnvironment;
  entities: string[];
  nodeEnv: string;
};

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
