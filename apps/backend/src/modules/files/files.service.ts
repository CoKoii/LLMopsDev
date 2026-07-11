import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { In, LessThan, Repository } from "typeorm";
import { OssService } from "../../common/oss/oss.service";
import type { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";
import { FILE_STATUS, FileEntity, type FileStatus } from "./file.entity";

const TEMPORARY_STATUSES: FileStatus[] = [
  FILE_STATUS.PENDING,
  FILE_STATUS.UPLOADED,
];
const TEMPORARY_PREFIX = "temporary/";
const USED_PREFIX = "uploads/";
const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_MAX_BATCHES = 10;

const normalizeExtension = (filename: string) =>
  extname(filename)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");

const createObjectKey = (userId: number, filename: string) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const extension = normalizeExtension(filename);

  return `${TEMPORARY_PREFIX}${year}/${month}/${day}/user-${userId}/${randomUUID()}${extension}`;
};

const createUsedObjectKey = (objectKey: string) =>
  objectKey.startsWith(TEMPORARY_PREFIX)
    ? objectKey.replace(TEMPORARY_PREFIX, USED_PREFIX)
    : objectKey;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    private readonly ossService: OssService,
  ) {}

  private async findOwnedFile(id: number, userId: number) {
    const file = await this.filesRepository.findOne({ where: { id } });

    if (!file) {
      throw new NotFoundException("文件不存在");
    }

    if (file.userId !== userId) {
      throw new ForbiddenException("无权访问该文件");
    }

    return file;
  }

  async createUploadIntent(dto: CreateUploadIntentDto, userId: number) {
    if (dto.size > this.ossService.uploadMaxSize) {
      throw new BadRequestException("文件大小超过限制");
    }

    const objectKey = createObjectKey(userId, dto.filename);
    const url = this.ossService.getPublicUrl(objectKey);
    const upload = this.ossService.createUploadUrl(objectKey, dto.contentType);
    const file = await this.filesRepository.save(
      this.filesRepository.create({
        userId,
        originalName: dto.filename,
        contentType: dto.contentType,
        size: dto.size,
        objectKey,
        url,
        status: FILE_STATUS.PENDING,
      }),
    );

    return { file, upload };
  }

  async complete(id: number, userId: number) {
    const file = await this.findOwnedFile(id, userId);

    if (file.status !== FILE_STATUS.PENDING) {
      throw new BadRequestException("文件状态不允许完成上传");
    }

    const object = await this.ossService.headObject(file.objectKey);
    if (object.size !== file.size) {
      throw new BadRequestException("文件大小与上传意图不一致");
    }
    if (object.contentType !== file.contentType) {
      throw new BadRequestException("文件类型与上传意图不一致");
    }

    file.status = FILE_STATUS.UPLOADED;
    return this.filesRepository.save(file);
  }

  findOne(id: number, userId: number) {
    return this.findOwnedFile(id, userId);
  }

  async remove(id: number, userId: number) {
    const file = await this.findOwnedFile(id, userId);

    await this.ossService.deleteObject(file.objectKey);
    await this.filesRepository.delete(file.id);
    return { success: true };
  }

  async markUsed(id: number, userId: number) {
    const file = await this.findOwnedFile(id, userId);

    if (file.status === FILE_STATUS.USED) {
      return file;
    }

    if (file.status !== FILE_STATUS.UPLOADED) {
      throw new BadRequestException("文件尚未上传完成");
    }

    const usedObjectKey = createUsedObjectKey(file.objectKey);
    const temporaryObjectKey = file.objectKey;
    if (usedObjectKey !== file.objectKey) {
      await this.ossService.copyObject(file.objectKey, usedObjectKey);
      file.objectKey = usedObjectKey;
      file.url = this.ossService.getPublicUrl(usedObjectKey);
    }

    file.status = FILE_STATUS.USED;
    file.usedAt = new Date();
    const savedFile = await this.filesRepository.save(file);

    if (usedObjectKey !== temporaryObjectKey) {
      try {
        await this.ossService.deleteObject(temporaryObjectKey);
      } catch (error) {
        this.logger.warn(
          `删除临时 OSS 对象失败 ${temporaryObjectKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return savedFile;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredTemporaryFiles() {
    if (!this.ossService.enabled) {
      return;
    }

    const expiredAt = new Date(
      Date.now() - this.ossService.tempExpiresInHours * 60 * 60 * 1000,
    );
    let deletedCount = 0;
    let failedCount = 0;

    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch += 1) {
      const files = await this.filesRepository.find({
        where: {
          status: In(TEMPORARY_STATUSES),
          createdAt: LessThan(expiredAt),
        },
        take: CLEANUP_BATCH_SIZE,
      });

      if (!files.length) {
        break;
      }

      for (const file of files) {
        try {
          await this.ossService.deleteObject(file.objectKey);
          await this.filesRepository.delete(file.id);
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          this.logger.warn(
            `清理临时文件失败 ${file.objectKey}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (files.length < CLEANUP_BATCH_SIZE) {
        break;
      }
    }

    this.logger.log(
      `临时文件清理完成，成功 ${deletedCount} 条，失败 ${failedCount} 条`,
    );
  }
}
