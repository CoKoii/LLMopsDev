import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { UpdateKnowledgeDto } from "./dto/update-knowledge.dto";
import { Knowledge } from "./entities/knowledge.entity";

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly filesService: FilesService,
  ) {}

  private withAccessibleIcon(knowledge: Knowledge): Knowledge {
    return {
      ...knowledge,
      icon: this.filesService.createAccessibleUrl(knowledge.icon),
    };
  }

  private async buildKnowledgePayload(
    dto: CreateKnowledgeDto | UpdateKnowledgeDto,
    userId: number,
  ): Promise<Partial<Knowledge>> {
    const payload: Partial<Knowledge> = {};

    if (dto.icon !== undefined) {
      payload.icon = dto.icon || null;
    }
    if (dto.name !== undefined) {
      payload.name = dto.name;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description || null;
    }
    if (dto.status !== undefined) {
      payload.status = dto.status;
    }
    if (dto.iconFileId !== undefined) {
      const file = await this.filesService.markUsed(dto.iconFileId, userId);
      payload.icon = file.url;
    }

    return payload;
  }

  // --------------------------------------------------------------------------------------------------
  // 创建知识库
  async create(createKnowledgeDto: CreateKnowledgeDto, userId: number) {
    await this.knowledgeRepository.save(
      this.knowledgeRepository.create(
        await this.buildKnowledgePayload(createKnowledgeDto, userId),
      ),
    );
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取知识库列表
  async list(
    query: QueryKnowledgeDto,
    userId: number,
  ): Promise<PageResult<Knowledge>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.knowledgeRepository
      .createQueryBuilder("knowledge")
      .where("knowledge.createdBy = :userId", { userId })
      .orderBy("knowledge.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("knowledge.name LIKE :name", {
        name: `%${name}%`,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(
      items.map((item) => this.withAccessibleIcon(item)),
      total,
      page,
      pageSize,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取知识库详情
  async findOne(id: number, userId: number) {
    const knowledge = await this.knowledgeRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!knowledge) throw new NotFoundException("知识库不存在");
    return this.withAccessibleIcon(knowledge);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新知识库
  async update(
    id: number,
    updateKnowledgeDto: UpdateKnowledgeDto,
    userId: number,
  ) {
    const knowledge = await this.knowledgeRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!knowledge) throw new NotFoundException("知识库不存在");
    Object.assign(
      knowledge,
      await this.buildKnowledgePayload(updateKnowledgeDto, userId),
    );
    await this.knowledgeRepository.save(knowledge);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除知识库
  async remove(id: number, userId: number) {
    const knowledge = await this.knowledgeRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!knowledge) throw new NotFoundException("知识库不存在");
    await this.knowledgeRepository.softRemove(knowledge);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
