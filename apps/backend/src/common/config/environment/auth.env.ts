import { ENV } from "./keys";
import { getRequiredString, type EnvironmentGetter } from "./readers";

export const createAuthEnvironment = (get: EnvironmentGetter) => ({
  accessTokenSecret: getRequiredString(
    get(ENV.JWT_ACCESS_SECRET),
    ENV.JWT_ACCESS_SECRET,
  ),
  accessTokenExpiresIn: getRequiredString(
    get(ENV.JWT_ACCESS_EXPIRES_IN),
    ENV.JWT_ACCESS_EXPIRES_IN,
  ),
  refreshTokenSecret: getRequiredString(
    get(ENV.JWT_REFRESH_SECRET),
    ENV.JWT_REFRESH_SECRET,
  ),
  refreshTokenExpiresIn: getRequiredString(
    get(ENV.JWT_REFRESH_EXPIRES_IN),
    ENV.JWT_REFRESH_EXPIRES_IN,
  ),
});
