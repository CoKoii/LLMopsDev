import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreateLlmDto } from "./dto/create-llm.dto";
import { QueryLlmsDto } from "./dto/query-llms.dto";
import { UpdateLlmDto } from "./dto/update-llm.dto";
import { Llm } from "./entities/llm.entity";

@Injectable()
export class LlmService {
  constructor(
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
  ) {}

  // --------------------------------------------------------------------------------------------------
  // 创建大模型
  async create(createLlmDto: CreateLlmDto) {
    await this.llmRepository.save(this.llmRepository.create(createLlmDto));
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取大模型列表
  async list(query: QueryLlmsDto): Promise<PageResult<Llm>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.llmRepository
      .createQueryBuilder("llm")
      .orderBy("llm.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("llm.modelName LIKE :name", {
        name: `%${name}%`,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(items, total, page, pageSize);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取大模型详情
  async findOne(id: number) {
    const llm = await this.llmRepository.findOne({ where: { id } });
    if (!llm) throw new NotFoundException("大模型不存在");
    return llm;
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新大模型
  async update(id: number, updateLlmDto: UpdateLlmDto) {
    const llm = await this.llmRepository.preload({
      id,
      ...updateLlmDto,
    });
    if (!llm) throw new NotFoundException("大模型不存在");
    await this.llmRepository.save(llm);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除大模型
  async remove(id: number) {
    const llm = await this.llmRepository.findOne({ where: { id } });
    if (!llm) throw new NotFoundException("大模型不存在");
    await this.llmRepository.softRemove(llm);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
