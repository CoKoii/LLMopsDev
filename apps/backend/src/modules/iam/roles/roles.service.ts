import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { DatabaseErrorMapper } from "../../../common/database/database-error.mapper";
import { AuthPermissionCacheService } from "../auth/auth-permission-cache.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { QueryRolesDto } from "./dto/query-roles.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { Role } from "./role.entity";

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly permissionCache: AuthPermissionCacheService,
    private readonly databaseErrorMapper: DatabaseErrorMapper,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 构建角色数据
  private buildRolePayload(dto: CreateRoleDto | UpdateRoleDto): Partial<Role> {
    const payload: Partial<Role> = {};

    if (dto.roleName !== undefined) {
      payload.roleName = dto.roleName;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description;
    }
    if (dto.status !== undefined) {
      payload.status = dto.status;
    }

    if (dto.permissions !== undefined) {
      payload.permissions = Array.from(new Set(dto.permissions)).map(
        (permissionId) => ({ id: permissionId }) as Role["permissions"][number],
      );
    }

    return payload;
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 创建角色
  async create(createRoleDto: CreateRoleDto) {
    try {
      const role = await this.roleRepository.save(
        this.roleRepository.create(this.buildRolePayload(createRoleDto)),
      );
      await this.permissionCache.invalidateByRoleIds([role.id]);
      return { success: true };
    } catch (error) {
      this.databaseErrorMapper.rethrow(error, {
        unique: "角色名称已存在",
        foreignKeyConstraint: "权限不存在",
      });
    }
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取角色列表
  async list(query: QueryRolesDto): Promise<PageResult<Role>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const roleName = query.roleName?.trim();
    const queryBuilder = this.roleRepository
      .createQueryBuilder("role")
      .select("role.id", "id")
      .orderBy("role.id", "DESC");

    if (roleName) {
      queryBuilder.andWhere("role.roleName LIKE :roleName", {
        roleName: `%${roleName}%`,
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

    const items = await this.roleRepository
      .createQueryBuilder("role")
      .leftJoinAndSelect("role.permissions", "permission")
      .where("role.id IN (:...ids)", { ids })
      .orderBy("role.id", "DESC")
      .getMany();

    return createPageResult(items, total, page, pageSize);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新角色
  async update(id: number, updateRoleDto: UpdateRoleDto) {
    try {
      const role = await this.roleRepository.preload({
        id,
        ...this.buildRolePayload(updateRoleDto),
      });
      if (!role) throw new NotFoundException("角色不存在");
      await this.roleRepository.save(role);
      await this.permissionCache.invalidateByRoleIds([id]);
      return { success: true };
    } catch (error) {
      this.databaseErrorMapper.rethrow(error, {
        unique: "角色名称已存在",
        foreignKeyConstraint: "权限不存在",
      });
    }
  }
  // --------------------------------------------------------------------------------------------------
}
