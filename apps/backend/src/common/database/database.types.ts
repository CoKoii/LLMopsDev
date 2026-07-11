import type { DataSourceOptions } from "typeorm";
import type { DatabaseEnvironment } from "../config/env";

export type DatabaseErrorMessages = {
  unique?: string;
  foreignKeyConstraint?: string;
  foreignKeyReferenced?: string;
  dataTooLong?: string;
  notNull?: string;
  noDefaultValue?: string;
  invalidValue?: string;
};

export type DatabaseConnectionContext = {
  databaseEnvironment: DatabaseEnvironment;
  entities: string[];
  nodeEnv: string;
};

export type DatabaseDriver = {
  createConnectionOptions: (
    context: DatabaseConnectionContext,
  ) => DataSourceOptions;
  rethrowError: (error: unknown, messages: DatabaseErrorMessages) => never;
};
