import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository, type FindOptionsRelations } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { Llm, LlmUsageType } from "../llm/entities/llm.entity";
import { Knowledge } from "../knowledge/entities/knowledge.entity";
import { Plugin } from "../plugin/entities/plugin.entity";
import { CreateAppDto } from "./dto/create-app.dto";
import { QueryAppsDto } from "./dto/query-apps.dto";
import { UpdateAppDraftDto } from "./dto/update-app-draft.dto";
import { UpdateAppDto } from "./dto/update-app.dto";
import {
  AiAppVersion,
  type AiAppVersionConfig,
  AiAppVersionStatus,
} from "./entities/app-version.entity";
import { AiAppCategory } from "./entities/app-category.entity";
import { AiApp } from "./entities/app.entity";

const DRAFT_VERSION = "draft";

type AppModelSummary = Pick<Llm, "id" | "modelName">;
type AppListItem = AiApp & {
  model: AppModelSummary | null;
};
type AppVersionPluginSummary = Pick<
  Plugin,
  "id" | "icon" | "name" | "description"
> & {
  category?: {
    id: number;
    key: string;
    name: string;
    sort: number;
  } | null;
  published?: boolean;
};
type AppVersionKnowledgeSummary = Pick<
  Knowledge,
  "id" | "icon" | "name" | "description" | "status"
>;
type AppVersionItem = AiAppVersion & {
  plugins: AppVersionPluginSummary[];
  knowledges: AppVersionKnowledgeSummary[];
};

const createDefaultDraftConfig = (): AiAppVersionConfig => ({
  llmId: null,
  modelSettings: {},
  capabilities: [],
  pluginIds: [],
  pluginSettings: {},
  knowledge: {
    ids: [],
    settings: {},
  },
  toggles: {
    longTermMemory: false,
    questionSuggestions: false,
    voiceInput: false,
    voiceOutput: false,
  },
});

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(AiAppCategory)
    private readonly appCategoryRepository: Repository<AiAppCategory>,
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly dataSource: DataSource,
    private readonly filesService: FilesService,
  ) {}

  private withAccessibleImage(app: AiApp): AiApp {
    return {
      ...app,
      image: this.filesService.createAccessibleUrl(app.image),
    };
  }

  private withAccessiblePluginImage(plugin: Plugin): AppVersionPluginSummary {
    return {
      id: plugin.id,
      icon: this.filesService.createAccessibleUrl(plugin.icon),
      name: plugin.name,
      description: plugin.description,
      published: plugin.published,
      category: plugin.category
        ? {
            id: plugin.category.id,
            key: plugin.category.key,
            name: plugin.category.name,
            sort: plugin.category.sort,
          }
        : null,
    };
  }

  private withAccessibleKnowledgeIcon(
    knowledge: Knowledge,
  ): AppVersionKnowledgeSummary {
    return {
      id: knowledge.id,
      icon: this.filesService.createAccessibleUrl(knowledge.icon),
      name: knowledge.name,
      description: knowledge.description,
      status: knowledge.status,
    };
  }

  private async loadVersionPlugins(
    config: AiAppVersionConfig,
  ): Promise<AppVersionPluginSummary[]> {
    const pluginIds = [...new Set(config.pluginIds ?? [])];
    if (!pluginIds.length) return [];

    const plugins = await this.pluginRepository.find({
      where: { id: In(pluginIds) },
      relations: { category: true },
    });
    const pluginMap = new Map(
      plugins.map((plugin) => [
        plugin.id,
        this.withAccessiblePluginImage(plugin),
      ]),
    );

    return pluginIds
      .map((id) => pluginMap.get(id))
      .filter(
        (plugin): plugin is AppVersionPluginSummary => plugin !== undefined,
      );
  }

  private async loadVersionKnowledges(
    config: AiAppVersionConfig,
    userId: number,
  ): Promise<AppVersionKnowledgeSummary[]> {
    const knowledgeIds = [...new Set(config.knowledge?.ids ?? [])];
    if (!knowledgeIds.length) return [];

    const knowledges = await this.knowledgeRepository.find({
      where: { id: In(knowledgeIds), createdBy: userId },
    });
    const knowledgeMap = new Map(
      knowledges.map((knowledge) => [
        knowledge.id,
        this.withAccessibleKnowledgeIcon(knowledge),
      ]),
    );

    return knowledgeIds
      .map((id) => knowledgeMap.get(id))
      .filter(
        (knowledge): knowledge is AppVersionKnowledgeSummary =>
          knowledge !== undefined,
      );
  }

  private async withVersionRelations(
    version: AiAppVersion,
    userId: number,
  ): Promise<AppVersionItem> {
    return {
      ...version,
      plugins: await this.loadVersionPlugins(version.config),
      knowledges: await this.loadVersionKnowledges(version.config, userId),
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
    if (dto.categoryId !== undefined) {
      const category = await this.appCategoryRepository.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException("应用分类不存在");
      payload.category = category;
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

  private mergeConfig(
    current: AiAppVersionConfig,
    next?: AiAppVersionConfig,
  ): AiAppVersionConfig {
    if (!next) return current;

    return {
      prompt: next.prompt === undefined ? current.prompt : next.prompt,
      llmId: next.llmId === undefined ? current.llmId : next.llmId,
      modelSettings: {
        ...current.modelSettings,
        ...next.modelSettings,
      },
      capabilities:
        next.capabilities === undefined
          ? current.capabilities
          : next.capabilities,
      pluginIds:
        next.pluginIds === undefined ? current.pluginIds : next.pluginIds,
      pluginSettings:
        next.pluginSettings === undefined
          ? current.pluginSettings
          : next.pluginSettings,
      knowledge:
        next.knowledge === undefined
          ? current.knowledge
          : {
              ids: next.knowledge.ids ?? current.knowledge?.ids ?? [],
              settings:
                next.knowledge.settings ?? current.knowledge?.settings ?? {},
            },
      toggles: {
        ...current.toggles,
        ...next.toggles,
      },
      openingStatement:
        next.openingStatement === undefined
          ? current.openingStatement
          : {
              ...current.openingStatement,
              ...next.openingStatement,
            },
    };
  }

  private async ensureSelectableChatModel(llmId?: number | null) {
    if (llmId === undefined || llmId === null) return;

    const llm = await this.llmRepository.findOne({
      select: ["id", "usageType", "enabled"],
      where: { id: llmId },
    });
    if (!llm || llm.usageType !== LlmUsageType.CHAT || !llm.enabled) {
      throw new NotFoundException("可用对话模型不存在");
    }
  }

  private async ensureApp(
    id: number,
    userId: number,
    relations?: FindOptionsRelations<AiApp>,
  ): Promise<AiApp> {
    const app = await this.appRepository.findOne({
      where: { id, createdBy: userId },
      relations,
    });
    if (!app) throw new NotFoundException("AI应用不存在");
    return app;
  }

  private async ensureDraftVersion(
    appId: number,
    userId: number,
  ): Promise<AiAppVersion> {
    await this.ensureApp(appId, userId);

    const draft = await this.appVersionRepository.findOne({
      where: {
        appId,
        version: DRAFT_VERSION,
        status: AiAppVersionStatus.DRAFT,
      },
    });

    if (draft) return draft;

    return this.appVersionRepository.save(
      this.appVersionRepository.create({
        appId,
        version: DRAFT_VERSION,
        status: AiAppVersionStatus.DRAFT,
        config: createDefaultDraftConfig(),
      }),
    );
  }

  private getNextPublishedVersion(versions: AiAppVersion[]): string {
    const nextNumber =
      versions.reduce((max, item) => {
        const matched = /^v(\d+)$/.exec(item.version);
        return matched ? Math.max(max, Number(matched[1])) : max;
      }, 0) + 1;

    return `v${nextNumber}`;
  }

  // --------------------------------------------------------------------------------------------------
  // 创建AI应用
  async create(createAppDto: CreateAppDto, userId: number) {
    const payload = await this.buildAppPayload(createAppDto, userId);
    await this.dataSource.transaction(async (manager) => {
      const app = await manager.save(AiApp, manager.create(AiApp, payload));
      await manager.save(
        AiAppVersion,
        manager.create(AiAppVersion, {
          appId: app.id,
          version: DRAFT_VERSION,
          status: AiAppVersionStatus.DRAFT,
          config: createDefaultDraftConfig(),
        }),
      );
    });
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用分类
  async listCategories() {
    return this.appCategoryRepository.find({
      order: { sort: "ASC", id: "ASC" },
    });
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用列表
  async list(
    query: QueryAppsDto,
    userId: number,
  ): Promise<PageResult<AppListItem>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const categoryKey = query.categoryKey?.trim();
    const queryBuilder = this.appRepository
      .createQueryBuilder("app")
      .leftJoinAndSelect("app.category", "category")
      .where("app.createdBy = :userId", { userId })
      .orderBy("app.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("app.name LIKE :name", {
        name: `%${name}%`,
      });
    }
    if (categoryKey) {
      queryBuilder.andWhere("category.key = :categoryKey", {
        categoryKey,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    const appIds = items.map((item) => item.id);
    const drafts = appIds.length
      ? await this.appVersionRepository.find({
          select: ["appId", "config"],
          where: {
            appId: In(appIds),
            version: DRAFT_VERSION,
            status: AiAppVersionStatus.DRAFT,
          },
        })
      : [];
    const draftByAppId = new Map(drafts.map((draft) => [draft.appId, draft]));
    const llmIds = [
      ...new Set(
        drafts
          .map((draft) => draft.config.llmId)
          .filter((llmId): llmId is number => typeof llmId === "number"),
      ),
    ];
    const llms = llmIds.length
      ? await this.llmRepository.find({
          select: ["id", "modelName"],
          where: { id: In(llmIds), usageType: LlmUsageType.CHAT, enabled: true },
        })
      : [];
    const llmById = new Map(llms.map((llm) => [llm.id, llm]));

    return createPageResult(
      items.map((item) => {
        const draft = draftByAppId.get(item.id);
        const llm = draft?.config.llmId
          ? llmById.get(draft.config.llmId)
          : undefined;

        return {
          ...this.withAccessibleImage(item),
          model: llm
            ? {
                id: llm.id,
                modelName: llm.modelName,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用详情
  async findOne(id: number, userId: number) {
    return this.withAccessibleImage(
      await this.ensureApp(id, userId, { category: true }),
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用草稿版本
  async getDraft(id: number, userId: number) {
    return this.withVersionRelations(
      await this.ensureDraftVersion(id, userId),
      userId,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 自动保存AI应用草稿版本
  async updateDraft(id: number, dto: UpdateAppDraftDto, userId: number) {
    const draft = await this.ensureDraftVersion(id, userId);
    await this.ensureSelectableChatModel(dto.config?.llmId);
    draft.config = this.mergeConfig(draft.config, dto.config);
    return this.withVersionRelations(
      await this.appVersionRepository.save(draft),
      userId,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用历史版本
  async listVersions(id: number, userId: number) {
    await this.ensureApp(id, userId);
    const versions = await this.appVersionRepository.find({
      where: [
        { appId: id, status: AiAppVersionStatus.PUBLISHED },
        { appId: id, status: AiAppVersionStatus.ARCHIVED },
      ],
      order: { id: "DESC" },
    });
    return Promise.all(
      versions.map((version) => this.withVersionRelations(version, userId)),
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 发布AI应用版本
  async publishVersion(id: number, userId: number) {
    const draft = await this.ensureDraftVersion(id, userId);
    const publishedVersions = await this.listVersions(id, userId);
    const version = this.getNextPublishedVersion(publishedVersions);

    return this.withVersionRelations(
      await this.appVersionRepository.save(
        this.appVersionRepository.create({
          appId: id,
          version,
          status: AiAppVersionStatus.PUBLISHED,
          config: draft.config,
          publishedAt: new Date(),
        }),
      ),
      userId,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 恢复历史版本到草稿
  async restoreVersion(id: number, versionId: number, userId: number) {
    await this.ensureApp(id, userId);
    const target = await this.appVersionRepository.findOne({
      where: { id: versionId, appId: id },
    });
    if (!target || target.status === AiAppVersionStatus.DRAFT) {
      throw new NotFoundException("历史版本不存在");
    }

    const draft = await this.ensureDraftVersion(id, userId);
    draft.config = target.config;
    return this.withVersionRelations(
      await this.appVersionRepository.save(draft),
      userId,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新AI应用
  async update(id: number, updateAppDto: UpdateAppDto, userId: number) {
    const app = await this.appRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!app) throw new NotFoundException("AI应用不存在");
    Object.assign(app, await this.buildAppPayload(updateAppDto, userId));
    await this.appRepository.save(app);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除AI应用
  async remove(id: number, userId: number) {
    const app = await this.appRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!app) throw new NotFoundException("AI应用不存在");
    await this.appRepository.softRemove(app);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------
}
