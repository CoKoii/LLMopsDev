import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { DatabaseErrorMapper } from "../../../common/database/database-error.mapper";
import { Role } from "../roles/role.entity";
import { AuthPermissionCacheService } from "../auth/auth-permission-cache.service";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly permissionCache: AuthPermissionCacheService,
    private readonly databaseErrorMapper: DatabaseErrorMapper,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 获取用户列表
  async list(query: QueryUsersDto): Promise<PageResult<User>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const nickname = query.nickname?.trim();
    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.profile", "profile")
      .select("user.id", "id")
      .orderBy("user.id", "DESC");

    if (nickname) {
      queryBuilder.andWhere("profile.nickname LIKE :nickname", {
        nickname: `%${nickname}%`,
      });
    }

    const total = await queryBuilder.clone().getCount();
    const ids = (
      await queryBuilder
        .clone()
        .skip(skip)
        .take(pageSize)
        .getRawMany<{ id: number | string }>()
    ).map(({ id }) => Number(id));

    if (!ids.length) {
      return createPageResult([], total, page, pageSize);
    }

    const items = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.profile", "profile")
      .leftJoinAndSelect("user.roles", "role")
      .where("user.id IN (:...ids)", { ids })
      .orderBy("user.id", "DESC")
      .getMany();

    return createPageResult(items, total, page, pageSize);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新用户
  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ["profile", "roles"],
    });
    if (!user) throw new NotFoundException("用户不存在");

    const { profile, roles, ...rest } = updateUserDto;
    if (profile) {
      user.profile = {
        ...(user.profile ?? { nickname: user.username }),
        ...profile,
      } as User["profile"];
    }
    Object.assign(user, rest);
    if (roles !== undefined) {
      user.roles = Array.from(new Set(roles)).map(
        (roleId) => ({ id: roleId }) as Role,
      );
    }
    try {
      await this.userRepository.save(user);
      await this.permissionCache.invalidateUser(id);
    } catch (error) {
      this.databaseErrorMapper.rethrow(error, {
        foreignKeyConstraint: "角色不存在",
      });
    }
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
