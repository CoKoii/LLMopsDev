import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { QueryWorkflowsDto } from "./dto/query-workflows.dto";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { Workflow } from "./entities/workflow.entity";

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    private readonly filesService: FilesService,
  ) {}

  private withAccessibleIcon(workflow: Workflow): Workflow {
    return {
      ...workflow,
      icon: this.filesService.createAccessibleUrl(workflow.icon),
    };
  }

  private async buildWorkflowPayload(
    dto: CreateWorkflowDto | UpdateWorkflowDto,
    userId: number,
  ): Promise<Partial<Workflow>> {
    const payload: Partial<Workflow> = {};

    if (dto.icon !== undefined) {
      payload.icon = dto.icon || null;
    }
    if (dto.name !== undefined) {
      payload.name = dto.name;
    }
    if (dto.englishName !== undefined) {
      payload.englishName = dto.englishName;
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
  // 创建工作流
  async create(createWorkflowDto: CreateWorkflowDto, userId: number) {
    await this.workflowRepository.save(
      this.workflowRepository.create(
        await this.buildWorkflowPayload(createWorkflowDto, userId),
      ),
    );
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取工作流列表
  async list(query: QueryWorkflowsDto): Promise<PageResult<Workflow>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.workflowRepository
      .createQueryBuilder("workflow")
      .orderBy("workflow.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere(
        "(workflow.name LIKE :name OR workflow.englishName LIKE :name)",
        { name: `%${name}%` },
      );
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
  // 获取工作流详情
  async findOne(id: number) {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException("工作流不存在");
    return this.withAccessibleIcon(workflow);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新工作流
  async update(
    id: number,
    updateWorkflowDto: UpdateWorkflowDto,
    userId: number,
  ) {
    const workflow = await this.workflowRepository.preload({
      id,
      ...(await this.buildWorkflowPayload(updateWorkflowDto, userId)),
    });
    if (!workflow) throw new NotFoundException("工作流不存在");
    await this.workflowRepository.save(workflow);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除工作流
  async remove(id: number) {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException("工作流不存在");
    await this.workflowRepository.softRemove(workflow);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
