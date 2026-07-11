import { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";
import { getRedisEnvironment } from "../config/env";

const DEFAULT_REDIS_CONNECT_TIMEOUT = 10_000;
const MAX_RETRY_DELAY = 2_000;

export const createRedisOptions = (
  configService: ConfigService,
): RedisOptions => {
  const redisEnvironment = getRedisEnvironment(configService);

  return {
    host: redisEnvironment.host,
    port: redisEnvironment.port,
    username: redisEnvironment.username,
    password: redisEnvironment.password,
    db: redisEnvironment.db,
    keyPrefix: redisEnvironment.keyPrefix,
    connectTimeout: DEFAULT_REDIS_CONNECT_TIMEOUT,
    keepAlive: DEFAULT_REDIS_CONNECT_TIMEOUT,
    lazyConnect: true,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, MAX_RETRY_DELAY),
  };
};
