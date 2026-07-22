import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import { RequestContextService } from "../../../common/request-context/request-context.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreatePluginDto } from "./dto/create-plugin.dto";
import { QueryPluginsDto } from "./dto/query-plugins.dto";
import { UpdatePluginDto } from "./dto/update-plugin.dto";
import { PluginCategory } from "./entities/plugin-category.entity";
import { Plugin, type PluginHeader } from "./entities/plugin.entity";
import { validatePluginOpenApiSchema } from "./openapi-schema.validator";

@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    @InjectRepository(PluginCategory)
    private readonly pluginCategoryRepository: Repository<PluginCategory>,
    private readonly filesService: FilesService,
    private readonly requestContext: RequestContextService,
  ) {}

  private withAccessibleIcon(plugin: Plugin): Plugin {
    return {
      ...plugin,
      icon: this.filesService.createAccessibleUrl(plugin.icon),
    };
  }

  private isVisibleToCurrentUser(plugin: Plugin, scope: "mine" | "available") {
    const userId = this.requestContext.getUserId();
    if (scope === "mine") {
      return userId !== undefined && plugin.createdBy === userId;
    }

    if (plugin.category?.key === "builtin") {
      return true;
    }

    return userId !== undefined && plugin.createdBy === userId;
  }

  private validateOpenApiSchema(openapiSchema: string) {
    const errors = validatePluginOpenApiSchema(openapiSchema);
    if (errors.length) {
      throw new BadRequestException(
        `OpenAPI Schema不完整：${errors.join("；")}`,
      );
    }
  }

  private normalizeHeaders(headers: PluginHeader[]) {
    return headers.map((header, index) => {
      const key = header.key.trim();
      const value = header.value.trim();
      if (!key || !value) {
        throw new BadRequestException(
          `Headers第${index + 1}项的Key和Value都必须填写`,
        );
      }

      return { key, value };
    });
  }

  private async buildPluginPayload(
    dto: CreatePluginDto | UpdatePluginDto,
    userId: number,
  ): Promise<Partial<Plugin>> {
    const payload: Partial<Plugin> = {};

    if (dto.icon !== undefined) {
      payload.icon = dto.icon || null;
    }
    if (dto.name !== undefined) {
      payload.name = dto.name;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description || null;
    }
    if (dto.categoryId !== undefined) {
      const category: PluginCategory | null =
        await this.pluginCategoryRepository.findOne({
          where: { id: dto.categoryId },
        });
      if (!category) throw new NotFoundException("插件分类不存在");
      if (category.key === "builtin") {
        throw new BadRequestException("内置分类仅系统插件可用");
      }
      payload.category = category;
    }
    if (dto.openapiSchema !== undefined) {
      this.validateOpenApiSchema(dto.openapiSchema);
      payload.openapiSchema = dto.openapiSchema;
    }
    if (dto.headers !== undefined) {
      payload.headers = this.normalizeHeaders(dto.headers);
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
  // 创建插件
  async create(createPluginDto: CreatePluginDto, userId: number) {
    await this.pluginRepository.save(
      this.pluginRepository.create(
        await this.buildPluginPayload(createPluginDto, userId),
      ),
    );
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取插件列表
  async list(query: QueryPluginsDto): Promise<PageResult<Plugin>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const scope = query.scope ?? "available";
    const userId = this.requestContext.getUserId();
    const queryBuilder = this.pluginRepository
      .createQueryBuilder("plugin")
      .leftJoinAndSelect("plugin.category", "category")
      .orderBy("plugin.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("plugin.name LIKE :name", {
        name: `%${name}%`,
      });
    }

    if (scope === "mine") {
      if (userId === undefined) {
        return createPageResult([], 0, page, pageSize);
      }
      queryBuilder.andWhere("plugin.createdBy = :userId", { userId });
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where("category.key IS NULL").orWhere(
            "category.key <> :builtinKey",
            {
              builtinKey: "builtin",
            },
          );
        }),
      );
    } else {
      if (userId === undefined) {
        queryBuilder.andWhere("category.key = :builtinKey", {
          builtinKey: "builtin",
        });
      } else {
        queryBuilder.andWhere(
          new Brackets((qb) => {
            qb.where("plugin.createdBy = :userId", { userId }).orWhere(
              "category.key = :builtinKey",
              { builtinKey: "builtin" },
            );
          }),
        );
      }
    }

    const [items, total]: [Plugin[], number] =
      await queryBuilder.getManyAndCount();
    return createPageResult(
      items.map((item) => this.withAccessibleIcon(item)),
      total,
      page,
      pageSize,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取插件详情
  async findOne(id: number) {
    const plugin: Plugin | null = await this.pluginRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!plugin) throw new NotFoundException("插件不存在");
    if (!this.isVisibleToCurrentUser(plugin, "available")) {
      throw new NotFoundException("插件不存在");
    }
    return this.withAccessibleIcon(plugin);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新插件
  async update(id: number, updatePluginDto: UpdatePluginDto, userId: number) {
    const plugin: Plugin | null = await this.pluginRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!plugin) throw new NotFoundException("插件不存在");
    if (plugin.category?.key === "builtin" || plugin.createdBy !== userId) {
      throw new NotFoundException("插件不存在");
    }
    Object.assign(
      plugin,
      await this.buildPluginPayload(updatePluginDto, userId),
    );
    await this.pluginRepository.save(plugin);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除插件
  async remove(id: number) {
    const plugin: Plugin | null = await this.pluginRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!plugin) throw new NotFoundException("插件不存在");
    const userId = this.requestContext.getUserId();
    if (
      userId === undefined ||
      plugin.category?.key === "builtin" ||
      plugin.createdBy !== userId
    ) {
      throw new NotFoundException("插件不存在");
    }
    await this.pluginRepository.softRemove(plugin);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
