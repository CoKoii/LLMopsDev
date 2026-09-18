import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserStatus } from "../../iam/users/user.entity";
import { OpenApiKey } from "./entities/open-api-key.entity";
import { hashOpenApiKey } from "./open-api-key.service";
import type { RequestWithOpenApiPrincipal } from "./open-api.types";

@Injectable()
export class OpenApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(OpenApiKey)
    private readonly keyRepository: Repository<OpenApiKey>,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithOpenApiPrincipal>();
    const authorization = request.headers.authorization;
    const secret = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!secret) {
      throw new UnauthorizedException("请提供有效的API密钥");
    }

    const key = await this.keyRepository
      .createQueryBuilder("apiKey")
      .addSelect("apiKey.secretHash")
      .leftJoinAndSelect("apiKey.user", "user")
      .where("apiKey.secretHash = :secretHash", {
        secretHash: hashOpenApiKey(secret),
      })
      .getOne();
    if (!key || !key.status || key.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("API密钥无效或已禁用");
    }

    request.openApiPrincipal = { keyId: key.id, userId: key.userId };
    await this.keyRepository.update(key.id, { lastUsedAt: new Date() });
    return true;
  }
}
