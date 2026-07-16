import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { Repository } from "typeorm";
import type { AuthUser } from "../../../common/auth/auth-user";
import { FilesService } from "../../files/files.service";
import { User } from "../users/user.entity";
import { ChangeCurrentPasswordDto } from "./dto/change-current-password.dto";
import { UpdateCurrentProfileDto } from "./dto/update-current-profile.dto";

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly filesService: FilesService,
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
            avatar: this.filesService.createAccessibleUrl(
              currentUser.profile.avatar,
            ),
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

  // --------------------------------------------------------------------------------------------------
  // 更新当前用户资料
  async updateCurrent(user: AuthUser, dto: UpdateCurrentProfileDto) {
    const currentUser = await this.userRepository.findOne({
      where: { id: user.userId },
      relations: ["profile"],
    });

    if (!currentUser) {
      throw new UnauthorizedException("用户不存在或已被删除");
    }

    const nickname =
      dto.nickname === undefined
        ? (currentUser.profile?.nickname ?? currentUser.username)
        : dto.nickname.trim();

    if (!nickname) {
      throw new BadRequestException("昵称不能为空");
    }

    let avatar = dto.avatar;
    if (dto.avatarFileId !== undefined) {
      const file = await this.filesService.markUsed(
        dto.avatarFileId,
        user.userId,
      );
      avatar = file.url;
    }

    currentUser.profile = {
      ...(currentUser.profile ?? { nickname: currentUser.username }),
      nickname,
      avatar: avatar === undefined ? currentUser.profile?.avatar : avatar || null,
    };

    await this.userRepository.save(currentUser);
    return this.getCurrent(user);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 修改当前用户密码
  async changePassword(
    user: AuthUser,
    dto: ChangeCurrentPasswordDto,
  ): Promise<{ success: true }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException("两次输入的新密码不一致");
    }

    const currentUser = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.id = :id", { id: user.userId })
      .getOne();

    if (!currentUser) {
      throw new UnauthorizedException("用户不存在或已被删除");
    }

    if (!(await argon2.verify(currentUser.password, dto.currentPassword))) {
      throw new BadRequestException("原密码不正确");
    }

    currentUser.password = await argon2.hash(dto.newPassword);
    await this.userRepository.save(currentUser);

    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
