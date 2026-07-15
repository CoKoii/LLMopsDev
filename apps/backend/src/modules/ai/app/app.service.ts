import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreateAppDto } from "./dto/create-app.dto";
import { QueryAppsDto } from "./dto/query-apps.dto";
import { UpdateAppDto } from "./dto/update-app.dto";
import { AiApp } from "./entities/app.entity";

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    private readonly filesService: FilesService,
  ) {}

  private withAccessibleImage(app: AiApp): AiApp {
    return {
      ...app,
      image: this.filesService.createAccessibleUrl(app.image),
    };
  }

  private async buildAppPayload(
    dto: CreateAppDto | UpdateAppDto,
    userId: number,
  ): Promise<Partial<AiApp>> {
    const payload: Partial<AiApp> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name;
    }
    if (dto.image !== undefined) {
      payload.image = dto.image || null;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description || null;
    }
    if (dto.llmId !== undefined) {
      payload.llmId = dto.llmId;
    }
    if (dto.status !== undefined) {
      payload.status = dto.status;
    }
    if (dto.imageFileId !== undefined) {
      const file = await this.filesService.markUsed(dto.imageFileId, userId);
      payload.image = file.url;
    }

    return payload;
  }

  // --------------------------------------------------------------------------------------------------
  // 创建AI应用
  async create(createAppDto: CreateAppDto, userId: number) {
    await this.appRepository.save(
      this.appRepository.create(
        await this.buildAppPayload(createAppDto, userId),
      ),
    );
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用列表
  async list(query: QueryAppsDto): Promise<PageResult<AiApp>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.appRepository
      .createQueryBuilder("app")
      .leftJoinAndSelect("app.llm", "llm")
      .orderBy("app.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("app.name LIKE :name", {
        name: `%${name}%`,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(
      items.map((item) => this.withAccessibleImage(item)),
      total,
      page,
      pageSize,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用详情
  async findOne(id: number) {
    const app = await this.appRepository.findOne({
      where: { id },
      relations: { llm: true },
    });
    if (!app) throw new NotFoundException("AI应用不存在");
    return this.withAccessibleImage(app);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新AI应用
  async update(id: number, updateAppDto: UpdateAppDto, userId: number) {
    const app = await this.appRepository.preload({
      id,
      ...(await this.buildAppPayload(updateAppDto, userId)),
    });
    if (!app) throw new NotFoundException("AI应用不存在");
    await this.appRepository.save(app);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除AI应用
  async remove(id: number) {
    const app = await this.appRepository.findOne({ where: { id } });
    if (!app) throw new NotFoundException("AI应用不存在");
    await this.appRepository.softRemove(app);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
