import { ENV } from "./keys";
import {
  getRequiredBoolean,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

export const createLoggingEnvironment = (get: EnvironmentGetter) => ({
  enabled: getRequiredBoolean(get(ENV.LOG_ON), ENV.LOG_ON),
  level: getRequiredString(get(ENV.LOG_LEVEL), ENV.LOG_LEVEL),
});
