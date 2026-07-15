import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreatePluginDto } from "./dto/create-plugin.dto";
import { QueryPluginsDto } from "./dto/query-plugins.dto";
import { UpdatePluginDto } from "./dto/update-plugin.dto";
import { Plugin } from "./entities/plugin.entity";

@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly filesService: FilesService,
  ) {}

  private withAccessibleIcon(plugin: Plugin): Plugin {
    return {
      ...plugin,
      icon: this.filesService.createAccessibleUrl(plugin.icon),
    };
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
    if (dto.openapiSchema !== undefined) {
      payload.openapiSchema = dto.openapiSchema;
    }
    if (dto.headers !== undefined) {
      payload.headers = dto.headers;
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
    const queryBuilder = this.pluginRepository
      .createQueryBuilder("plugin")
      .orderBy("plugin.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("plugin.name LIKE :name", {
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
  // 获取插件详情
  async findOne(id: number) {
    const plugin = await this.pluginRepository.findOne({ where: { id } });
    if (!plugin) throw new NotFoundException("插件不存在");
    return this.withAccessibleIcon(plugin);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新插件
  async update(id: number, updatePluginDto: UpdatePluginDto, userId: number) {
    const plugin = await this.pluginRepository.preload({
      id,
      ...(await this.buildPluginPayload(updatePluginDto, userId)),
    });
    if (!plugin) throw new NotFoundException("插件不存在");
    await this.pluginRepository.save(plugin);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除插件
  async remove(id: number) {
    const plugin = await this.pluginRepository.findOne({ where: { id } });
    if (!plugin) throw new NotFoundException("插件不存在");
    await this.pluginRepository.softRemove(plugin);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
