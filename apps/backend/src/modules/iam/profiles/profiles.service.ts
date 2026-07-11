import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { AuthUser } from "../../../common/auth/auth-user";
import { User } from "../users/user.entity";

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 获取当前用户资料
  async getCurrent(user: AuthUser) {
    const currentUser = await this.userRepository.findOne({
      where: { id: user.userId },
      relations: ["profile"],
    });

    if (!currentUser) {
      throw new UnauthorizedException("用户不存在或已被删除");
    }

    return {
      id: currentUser.id,
      username: currentUser.username,
      status: currentUser.status,
      profile: currentUser.profile
        ? {
            id: currentUser.profile.id,
            nickname: currentUser.profile.nickname,
            createdAt: currentUser.profile.createdAt,
            updatedAt: currentUser.profile.updatedAt,
          }
        : null,
      roles: user.roles,
      permissions: user.permissions,
      createdAt: currentUser.createdAt,
      updatedAt: currentUser.updatedAt,
    };
  }
  // --------------------------------------------------------------------------------------------------
}
