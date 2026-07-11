import { ENV } from "./keys";
import {
  getExplicitOptionalString,
  getRequiredNumber,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

export const createRedisEnvironment = (get: EnvironmentGetter) => ({
  host: getRequiredString(get(ENV.REDIS_HOST), ENV.REDIS_HOST),
  port: getRequiredNumber(get(ENV.REDIS_PORT), ENV.REDIS_PORT),
  username: getExplicitOptionalString(
    get(ENV.REDIS_USERNAME),
    ENV.REDIS_USERNAME,
  ),
  password: getExplicitOptionalString(
    get(ENV.REDIS_PASSWORD),
    ENV.REDIS_PASSWORD,
  ),
  db: getRequiredNumber(get(ENV.REDIS_DB), ENV.REDIS_DB),
  keyPrefix: getExplicitOptionalString(
    get(ENV.REDIS_KEY_PREFIX),
    ENV.REDIS_KEY_PREFIX,
  ),
});
