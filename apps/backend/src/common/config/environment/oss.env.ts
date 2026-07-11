import { ENV } from "./keys";
import {
  getExplicitOptionalString,
  getRequiredBoolean,
  getRequiredNumber,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

const getOptionalConfiguredString = (value: unknown, key: string) =>
  typeof value === "string" ? getExplicitOptionalString(value, key) : undefined;

export const createOssEnvironment = (get: EnvironmentGetter) => {
  const publicBaseUrl = get(ENV.OSS_PUBLIC_BASE_URL);

  return {
    enabled: getRequiredBoolean(get(ENV.OSS_ENABLED), ENV.OSS_ENABLED),
    region: getRequiredString(get(ENV.OSS_REGION), ENV.OSS_REGION),
    bucket: getExplicitOptionalString(get(ENV.OSS_BUCKET), ENV.OSS_BUCKET),
    accessKeyId: getExplicitOptionalString(
      get(ENV.OSS_ACCESS_KEY_ID),
      ENV.OSS_ACCESS_KEY_ID,
    ),
    accessKeySecret: getExplicitOptionalString(
      get(ENV.OSS_ACCESS_KEY_SECRET),
      ENV.OSS_ACCESS_KEY_SECRET,
    ),
    publicBaseUrl: getOptionalConfiguredString(
      publicBaseUrl,
      ENV.OSS_PUBLIC_BASE_URL,
    ),
    uploadExpiresIn: getRequiredNumber(
      get(ENV.OSS_UPLOAD_EXPIRES_IN),
      ENV.OSS_UPLOAD_EXPIRES_IN,
    ),
    uploadMaxSize: getRequiredNumber(
      get(ENV.OSS_UPLOAD_MAX_SIZE),
      ENV.OSS_UPLOAD_MAX_SIZE,
    ),
    tempExpiresInHours: getRequiredNumber(
      get(ENV.OSS_TEMP_EXPIRES_IN_HOURS),
      ENV.OSS_TEMP_EXPIRES_IN_HOURS,
    ),
  };
};
