import { ENV, type DatabaseType } from "./keys";
import {
  getRequiredBoolean,
  getRequiredDatabaseType,
  getRequiredNumber,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

export type DatabaseEnvironment = {
  type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
};

export const createDatabaseEnvironment = (
  get: EnvironmentGetter,
): DatabaseEnvironment => {
  const type = getRequiredDatabaseType(get(ENV.DB_TYPE), ENV.DB_TYPE);

  return {
    type,
    host: getRequiredString(get(ENV.DB_HOST), ENV.DB_HOST),
    port: getRequiredNumber(get(ENV.DB_PORT), ENV.DB_PORT),
    username: getRequiredString(get(ENV.DB_USERNAME), ENV.DB_USERNAME),
    password: getRequiredString(get(ENV.DB_PASSWORD), ENV.DB_PASSWORD),
    database: getRequiredString(get(ENV.DB_DATABASE), ENV.DB_DATABASE),
    synchronize: getRequiredBoolean(get(ENV.DB_SYNC), ENV.DB_SYNC),
  };
};
