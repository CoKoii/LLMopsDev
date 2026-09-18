import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";
import { REDIS } from "./redis.token";
import { createRedisOptions } from "./redis.config";

const redisLogger = new Logger("RedisModule");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<RedisClient> => {
        const client = new Redis(createRedisOptions(configService));

        client.on("ready", () => {
          redisLogger.log("Redis 连接已建立");
        });
        client.on("reconnecting", () => {
          redisLogger.warn("Redis 正在重连");
        });
        client.on("error", (error) => {
          redisLogger.error(error.message, error.stack);
        });

        try {
          await client.connect();
          await client.ping();
        } catch (error) {
          client.disconnect();
          throw error;
        }

        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redisClient: RedisClient) {}

  async onApplicationShutdown() {
    if (this.redisClient.status === "end") {
      return;
    }

    try {
      await this.redisClient.quit();
    } catch {
      this.redisClient.disconnect();
    }
  }
}
