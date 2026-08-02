import { createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateOpenApiKeyDto } from "./dto/create-open-api-key.dto";
import { UpdateOpenApiKeyDto } from "./dto/update-open-api-key.dto";
import { OpenApiKey } from "./entities/open-api-key.entity";

const KEY_PREFIX = "llmops-v1/";

export const hashOpenApiKey = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

@Injectable()
export class OpenApiKeyService {
  constructor(
    @InjectRepository(OpenApiKey)
    private readonly keyRepository: Repository<OpenApiKey>,
  ) {}

  private toItem(key: OpenApiKey) {
    return {
      id: key.id,
      key: `${key.keyPrefix}****${key.keySuffix}`,
      status: key.status,
      remark: key.remark ?? "",
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      lastUsedAt: key.lastUsedAt ?? null,
    };
  }

  private async findOwnedKey(id: number, userId: number) {
    const key = await this.keyRepository.findOne({ where: { id, userId } });
    if (!key) throw new NotFoundException("API密钥不存在");
    return key;
  }

  async list(userId: number) {
    const keys = await this.keyRepository.find({
      where: { userId },
      order: { id: "DESC" },
    });
    return keys.map((key) => this.toItem(key));
  }

  async create(dto: CreateOpenApiKeyDto, userId: number) {
    const secret = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const key = await this.keyRepository.save(
      this.keyRepository.create({
        userId,
        keyPrefix: secret.slice(0, KEY_PREFIX.length + 8),
        keySuffix: secret.slice(-4),
        secretHash: hashOpenApiKey(secret),
        status: dto.status ?? true,
        remark: dto.remark?.trim() || null,
        createdBy: userId,
        updatedBy: userId,
      }),
    );

    return { ...this.toItem(key), secret };
  }

  async update(id: number, dto: UpdateOpenApiKeyDto, userId: number) {
    const key = await this.findOwnedKey(id, userId);

    if (dto.status !== undefined) key.status = dto.status;
    if (dto.remark !== undefined) key.remark = dto.remark.trim() || null;
    key.updatedBy = userId;

    return this.toItem(await this.keyRepository.save(key));
  }

  async remove(id: number, userId: number) {
    const key = await this.findOwnedKey(id, userId);
    await this.keyRepository.softRemove(key);
    return { id };
  }
}
