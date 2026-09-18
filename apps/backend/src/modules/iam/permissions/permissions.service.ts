import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { AuthPermissionCacheService } from "../auth/auth-permission-cache.service";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import type { QueryPermissionsDto } from "./dto/query-permissions.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { Permission } from "./permission.entity";

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly permissionCache: AuthPermissionCacheService,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 创建权限
  async create(createPermissionDto: CreatePermissionDto) {
    await this.permissionRepository.save(createPermissionDto);
    await this.permissionCache.invalidateAll();
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取权限列表
  async list(query: QueryPermissionsDto): Promise<PageResult<Permission>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const code = query.code?.trim();
    const queryBuilder = this.permissionRepository
      .createQueryBuilder("permission")
      .orderBy("permission.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (code) {
      queryBuilder.andWhere("permission.code LIKE :code", {
        code: `%${code}%`,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(items, total, page, pageSize);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新权限
  async update(id: number, updatePermissionDto: UpdatePermissionDto) {
    const permission = await this.permissionRepository.preload({
      id,
      ...updatePermissionDto,
    });
    if (!permission) throw new NotFoundException("权限不存在");
    await this.permissionRepository.save(permission);
    await this.permissionCache.invalidateAll();
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取当前用户权限
  listMine(permissions: string[] = []) {
    return Array.from(new Set(permissions)).sort((left, right) =>
      left.localeCompare(right),
    );
  }
  // --------------------------------------------------------------------------------------------------
}
