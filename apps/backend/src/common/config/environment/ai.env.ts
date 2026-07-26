import { ENV } from "./keys";
import {
  getRequiredBoolean,
  getRequiredNumber,
  getRequiredString,
  type EnvironmentGetter,
} from "./readers";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const createAiEnvironment = (get: EnvironmentGetter) => {
  const apiKey = getRequiredString(get(ENV.AI_API_KEY), ENV.AI_API_KEY);
  const baseUrl = trimTrailingSlash(
    getRequiredString(get(ENV.AI_BASE_URL), ENV.AI_BASE_URL),
  );

  return {
    enabled: getRequiredBoolean(get(ENV.AI_ENABLED), ENV.AI_ENABLED),
    apiKey,
    baseUrl,
    chatModel: getRequiredString(get(ENV.AI_CHAT_MODEL), ENV.AI_CHAT_MODEL),
    temperature: getRequiredNumber(get(ENV.AI_TEMPERATURE), ENV.AI_TEMPERATURE),
    structuredOutput: {
      apiKey,
      baseUrl,
      model: getRequiredString(
        get(ENV.AI_STRUCTURED_OUTPUT_MODEL),
        ENV.AI_STRUCTURED_OUTPUT_MODEL,
      ),
    },
    embedding: {
      apiKey,
      baseUrl,
      model: getRequiredString(
        get(ENV.AI_EMBEDDING_MODEL),
        ENV.AI_EMBEDDING_MODEL,
      ),
    },
  };
};
