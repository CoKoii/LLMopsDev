import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthPermissionCacheService } from "./auth-permission-cache.service";
import { Role } from "../roles/role.entity";
import { User } from "../users/user.entity";

const ADMIN_ROLE_NAME = "admin";
const DEFAULT_BOOTSTRAP_ADMIN_USERNAME = "super_admin";

@Injectable()
export class AuthBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AuthBootstrapService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly permissionCache: AuthPermissionCacheService,
  ) {}

  async onModuleInit() {
    let adminRole = await this.roleRepository.findOne({
      where: { roleName: ADMIN_ROLE_NAME },
    });
    const shouldBootstrapRole = !adminRole;
    if (!adminRole) {
      adminRole = await this.roleRepository.save(
        this.roleRepository.create({
          roleName: ADMIN_ROLE_NAME,
          description: "系统管理员",
          status: true,
        }),
      );
    }
    const username =
      this.configService.get<string>("AUTH_BOOTSTRAP_ADMIN_USERNAME") ||
      DEFAULT_BOOTSTRAP_ADMIN_USERNAME;
    const user = await this.userRepository.findOne({
      where: { username },
      relations: { roles: true },
    });
    if (!user) {
      this.logger.warn(`未找到初始化管理员账号：${username}`);
      return;
    }

    const hasAdminRole = user.roles?.some(
      (role) => role.id === adminRole.id,
    );
    if (shouldBootstrapRole && !hasAdminRole) {
      user.roles = [...(user.roles ?? []), adminRole];
      await this.userRepository.save(user);
    }
    await this.permissionCache.invalidateUser(user.id);
    if (shouldBootstrapRole && !hasAdminRole) {
      this.logger.log(`已为账号 ${username} 初始化 admin 角色`);
    }
  }
}
