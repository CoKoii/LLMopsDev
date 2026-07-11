import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../../../common/cache/redis.token";

const MAX_LOGIN_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;

const normalizeKeyPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9:.@_-]/g, "_") || "unknown";

@Injectable()
export class LoginRateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private failureKey(ip: string, username: string) {
    return `auth:login:fail:${normalizeKeyPart(ip)}:${normalizeKeyPart(username)}`;
  }

  private lockKey(ip: string, username: string) {
    return `auth:login:lock:${normalizeKeyPart(ip)}:${normalizeKeyPart(username)}`;
  }

  async assertAllowed(ip: string, username: string): Promise<void> {
    const ttl = await this.redis.ttl(this.lockKey(ip, username));
    if (ttl > 0) {
      throw new ForbiddenException(`登录失败次数过多，请${ttl}秒后再试`);
    }
  }

  async recordFailure(ip: string, username: string): Promise<void> {
    const failureKey = this.failureKey(ip, username);
    const failures = await this.redis.incr(failureKey);

    if (failures === 1) {
      await this.redis.expire(failureKey, FAILURE_WINDOW_SECONDS);
    }

    if (failures >= MAX_LOGIN_FAILURES) {
      await this.redis.set(this.lockKey(ip, username), "1", "EX", LOCK_SECONDS);
    }
  }

  async clear(ip: string, username: string): Promise<void> {
    await this.redis.del(
      this.failureKey(ip, username),
      this.lockKey(ip, username),
    );
  }
}
