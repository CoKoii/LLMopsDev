import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { Llm } from "../llm/entities/llm.entity";
import { CreateAppDto } from "./dto/create-app.dto";
import { QueryAppsDto } from "./dto/query-apps.dto";
import { UpdateAppDraftDto } from "./dto/update-app-draft.dto";
import { UpdateAppDto } from "./dto/update-app.dto";
import {
  AiAppVersion,
  type AiAppVersionConfig,
  AiAppVersionStatus,
} from "./entities/app-version.entity";
import { AiApp } from "./entities/app.entity";

const DRAFT_VERSION = "draft";

type AppModelSummary = Pick<Llm, "id" | "provider" | "modelName">;
type AppListItem = AiApp & {
  model: AppModelSummary | null;
};

const createDefaultDraftConfig = (): AiAppVersionConfig => ({
  llmId: null,
  modelSettings: {},
  capabilities: [],
  pluginIds: [],
  workflowIds: [],
  knowledgeIds: [],
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
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    private readonly dataSource: DataSource,
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
      ...current,
      ...next,
      modelSettings: {
        ...current.modelSettings,
        ...next.modelSettings,
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

  private async ensureApp(id: number): Promise<AiApp> {
    const app = await this.appRepository.findOne({ where: { id } });
    if (!app) throw new NotFoundException("AI应用不存在");
    return app;
  }

  private async ensureDraftVersion(appId: number): Promise<AiAppVersion> {
    await this.ensureApp(appId);

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
  // 获取AI应用列表
  async list(query: QueryAppsDto): Promise<PageResult<AppListItem>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.appRepository
      .createQueryBuilder("app")
      .orderBy("app.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("app.name LIKE :name", {
        name: `%${name}%`,
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
          select: ["id", "provider", "modelName"],
          where: { id: In(llmIds) },
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
                provider: llm.provider,
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
  async findOne(id: number) {
    const app = await this.ensureApp(id);
    return this.withAccessibleImage(app);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用草稿版本
  async getDraft(id: number) {
    return this.ensureDraftVersion(id);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 自动保存AI应用草稿版本
  async updateDraft(id: number, dto: UpdateAppDraftDto) {
    const draft = await this.ensureDraftVersion(id);
    draft.config = this.mergeConfig(draft.config, dto.config);
    return this.appVersionRepository.save(draft);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取AI应用历史版本
  async listVersions(id: number) {
    await this.ensureApp(id);
    return this.appVersionRepository.find({
      where: [
        { appId: id, status: AiAppVersionStatus.PUBLISHED },
        { appId: id, status: AiAppVersionStatus.ARCHIVED },
      ],
      order: { id: "DESC" },
    });
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 发布AI应用版本
  async publishVersion(id: number) {
    const draft = await this.ensureDraftVersion(id);
    const publishedVersions = await this.listVersions(id);
    const version = this.getNextPublishedVersion(publishedVersions);

    return this.appVersionRepository.save(
      this.appVersionRepository.create({
        appId: id,
        version,
        status: AiAppVersionStatus.PUBLISHED,
        config: draft.config,
        publishedAt: new Date(),
      }),
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 恢复历史版本到草稿
  async restoreVersion(id: number, versionId: number) {
    const target = await this.appVersionRepository.findOne({
      where: { id: versionId, appId: id },
    });
    if (!target || target.status === AiAppVersionStatus.DRAFT) {
      throw new NotFoundException("历史版本不存在");
    }

    const draft = await this.ensureDraftVersion(id);
    draft.config = target.config;
    return this.appVersionRepository.save(draft);
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
