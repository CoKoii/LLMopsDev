import { ENV } from "./keys";
import {
  getRequiredNodeEnv,
  getRequiredNumber,
  parseCommaSeparatedValue,
  type EnvironmentGetter,
} from "./readers";

export const createAppEnvironment = (get: EnvironmentGetter) => ({
  nodeEnv: getRequiredNodeEnv(get(ENV.NODE_ENV), ENV.NODE_ENV),
  port: getRequiredNumber(get(ENV.PORT), ENV.PORT),
  corsOrigins: parseCommaSeparatedValue(
    get(ENV.CORS_ORIGINS),
    ENV.CORS_ORIGINS,
  ),
});
