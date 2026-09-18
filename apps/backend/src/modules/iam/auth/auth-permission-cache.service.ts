import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../../../common/cache/redis.token";
import type { AuthUser } from "../../../common/auth/auth-user";

export type CachedAuthProfile = Pick<
  AuthUser,
  "username" | "roles" | "permissions"
>;

const AUTH_CACHE_PREFIX = "auth:user:";
const AUTH_CACHED_USERS_KEY = "auth:users";
const AUTH_USER_CURRENT_SUFFIX = ":current";
const AUTH_USER_ROLES_SUFFIX = ":roles";
const AUTH_ROLE_USERS_PREFIX = "auth:role:";
const AUTH_ROLE_USERS_SUFFIX = ":users";
const DEFAULT_AUTH_CACHE_TTL_SECONDS = 5 * 60;

@Injectable()
export class AuthPermissionCacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private currentKey(userId: number) {
    return `${AUTH_CACHE_PREFIX}${userId}${AUTH_USER_CURRENT_SUFFIX}`;
  }

  private rolesKey(userId: number) {
    return `${AUTH_CACHE_PREFIX}${userId}${AUTH_USER_ROLES_SUFFIX}`;
  }

  private roleUsersKey(roleId: number) {
    return `${AUTH_ROLE_USERS_PREFIX}${roleId}${AUTH_ROLE_USERS_SUFFIX}`;
  }

  async getCurrentUser(userId: number): Promise<CachedAuthProfile | null> {
    const cached = await this.redis.get(this.currentKey(userId));
    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as CachedAuthProfile;
  }

  async setCurrentUser(user: AuthUser, roleIds: number[]): Promise<void> {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    const pipeline = this.redis
      .multi()
      .set(
        this.currentKey(user.userId),
        JSON.stringify({
          username: user.username,
          roles: user.roles,
          permissions: user.permissions,
        } satisfies CachedAuthProfile),
        "EX",
        DEFAULT_AUTH_CACHE_TTL_SECONDS,
      )
      .set(
        this.rolesKey(user.userId),
        JSON.stringify(Array.from(new Set(roleIds))),
        "EX",
        DEFAULT_AUTH_CACHE_TTL_SECONDS,
      )
      .sadd(AUTH_CACHED_USERS_KEY, String(user.userId))
      .expire(AUTH_CACHED_USERS_KEY, DEFAULT_AUTH_CACHE_TTL_SECONDS);

    uniqueRoleIds.forEach((roleId) => {
      pipeline
        .sadd(this.roleUsersKey(roleId), String(user.userId))
        .expire(this.roleUsersKey(roleId), DEFAULT_AUTH_CACHE_TTL_SECONDS);
    });

    await pipeline.exec();
  }

  async invalidateUser(userId: number): Promise<void> {
    await this.redis
      .multi()
      .del(this.currentKey(userId), this.rolesKey(userId))
      .srem(AUTH_CACHED_USERS_KEY, String(userId))
      .exec();
  }

  async invalidateUsers(userIds: number[]): Promise<void> {
    const keys = Array.from(
      new Set(
        userIds.flatMap((userId) => [
          this.currentKey(userId),
          this.rolesKey(userId),
        ]),
      ),
    );
    if (keys.length) {
      await this.redis
        .multi()
        .del(...keys)
        .srem(AUTH_CACHED_USERS_KEY, ...userIds.map((userId) => String(userId)))
        .exec();
    }
  }

  async invalidateByRoleIds(roleIds: number[]): Promise<void> {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    if (!uniqueRoleIds.length) {
      return;
    }

    const roleUserSets = await Promise.all(
      uniqueRoleIds.map((roleId) =>
        this.redis.smembers(this.roleUsersKey(roleId)),
      ),
    );
    const userIds = roleUserSets
      .flat()
      .map((userId) => Number(userId))
      .filter((userId) => Number.isInteger(userId));

    await this.invalidateUsers(userIds);
  }

  async invalidateAll(): Promise<void> {
    const userIds = (await this.redis.smembers(AUTH_CACHED_USERS_KEY))
      .map((userId) => Number(userId))
      .filter((userId) => Number.isInteger(userId));

    await this.invalidateUsers(userIds);
    if (userIds.length) {
      await this.redis.del(AUTH_CACHED_USERS_KEY);
    }
  }
}
