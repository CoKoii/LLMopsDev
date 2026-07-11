import { DataSource } from "typeorm";
import { loadEnvironmentFiles } from "./src/common/config/env";
import { createDataSourceOptions } from "./src/common/database/database.config";

loadEnvironmentFiles();

export default new DataSource(createDataSourceOptions());
