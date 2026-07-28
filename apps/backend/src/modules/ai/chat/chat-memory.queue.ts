import type { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";
import { createRedisOptions } from "../../../common/cache/redis.config";

export const CHAT_MEMORY_QUEUE = "chat-memory";

export const CHAT_MEMORY_REFRESH_JOB = "refresh-memory";

export interface ChatMemoryRefreshJobData {
  appId: number;
  userId: number;
  sessionId: number;
}

export const createChatMemoryRedisOptions = (
  configService: ConfigService,
): RedisOptions => {
  const options = createRedisOptions(configService);
  delete options.keyPrefix;
  delete options.maxRetriesPerRequest;

  return {
    ...options,
    maxRetriesPerRequest: null,
  };
};
