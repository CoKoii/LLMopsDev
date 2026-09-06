import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, In, Repository } from "typeorm";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../common/http/page-query.dto";
import { User, UserStatus } from "../iam/users/user.entity";
import { AiApp } from "../ai/app/entities/app.entity";
import { Plugin } from "../ai/plugin/entities/plugin.entity";
import { PluginCategory } from "../ai/plugin/entities/plugin-category.entity";
import { Knowledge } from "../ai/knowledge/entities/knowledge.entity";
import { KnowledgeDocument } from "../ai/knowledge/entities/knowledge-document.entity";
import { KnowledgeDocumentChunk } from "../ai/knowledge/entities/knowledge-document-chunk.entity";
import { Llm, LlmTestStatus } from "../ai/llm/entities/llm.entity";
import {
  ChatMessage,
  CHAT_MESSAGE_ROLE,
} from "../ai/chat/entities/chat-message.entity";
import { ChatSession } from "../ai/chat/entities/chat-session.entity";
import { AiAppCategory } from "../ai/app/entities/app-category.entity";
import { QueryAdminResourcesDto } from "./dto/query-admin-resources.dto";
import { UpdateAdminResourceDto } from "./dto/update-admin-resource.dto";

type AdminResourceItem = {
  id: number;
  name: string;
  description?: string | null;
  status: boolean;
  published?: boolean;
  categoryName?: string | null;
  ownerId?: number | null;
  ownerUsername?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const toNumber = (value: unknown) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeDocumentChunk)
    private readonly chunkRepository: Repository<KnowledgeDocumentChunk>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
  ) {}

  private getDateExpression(alias: string, column = "createdAt") {
    const type = this.dataSource.options.type;
    return type === "postgres"
      ? `DATE(${alias}."${column}")`
      : `DATE(${alias}.\`${column}\`)`;
  }

  private createDateKeys(days: number) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    const keys = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
    return { start, keys };
  }

  private normalizeDate(value: Date | string) {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10);
  }

  async getOverview(days = 7) {
    const rangeDays = days === 30 ? 30 : 7;
    const { start, keys } = this.createDateKeys(rangeDays);
    const [
      totalUsers,
      activeUsers,
      totalApps,
      activeApps,
      publishedApps,
      totalPlugins,
      publishedPlugins,
      totalKnowledges,
      totalDocuments,
      totalChunks,
      enabledModels,
      failedDocuments,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.appRepository.count(),
      this.appRepository.count({ where: { status: true } }),
      this.appRepository.count({ where: { published: true } }),
      this.pluginRepository.count(),
      this.pluginRepository.count({ where: { published: true } }),
      this.knowledgeRepository.count(),
      this.documentRepository.count(),
      this.chunkRepository.count(),
      this.llmRepository.count({ where: { enabled: true } }),
      this.documentRepository
        .createQueryBuilder("document")
        .where(
          new Brackets((query) => {
            query
              .where("document.parseStatus = :failed")
              .orWhere("document.cleanStatus = :failed")
              .orWhere("document.enhanceStatus = :failed")
              .orWhere("document.chunkStatus = :failed")
              .orWhere("document.embeddingStatus = :failed")
              .orWhere("document.indexStatus = :failed");
          }),
        )
        .setParameter("failed", "failed")
        .getCount(),
    ]);

    const dailyMap = new Map(
      keys.map((date) => [
        date,
        {
          date,
          sessions: 0,
          activeUsers: 0,
          messages: 0,
          tokens: 0,
          errors: 0,
          avgLatencyMs: 0,
        },
      ]),
    );
    const sessionDate = this.getDateExpression("session");
    const sessionRows = await this.sessionRepository
      .createQueryBuilder("session")
      .select(sessionDate, "date")
      .addSelect("COUNT(session.id)", "sessions")
      .where("session.createdAt >= :start", { start })
      .groupBy(sessionDate)
      .getRawMany<{ date: Date | string; sessions: string }>();
    for (const row of sessionRows) {
      const item = dailyMap.get(this.normalizeDate(row.date));
      if (item) item.sessions = toNumber(row.sessions);
    }

    const messageDate = this.getDateExpression("message");
    const messageRows = await this.messageRepository
      .createQueryBuilder("message")
      .innerJoin("message.session", "session")
      .select(messageDate, "date")
      .addSelect("COUNT(message.id)", "messages")
      .addSelect("COUNT(DISTINCT session.userId)", "activeUsers")
      .addSelect(
        "COALESCE(SUM(CASE WHEN message.role = :assistantRole AND message.tokens IS NOT NULL THEN message.tokens ELSE 0 END), 0)",
        "tokens",
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN message.status = :failedStatus THEN 1 ELSE 0 END), 0)",
        "errors",
      )
      .addSelect(
        "COALESCE(AVG(CASE WHEN message.role = :assistantRole AND message.elapsedMs IS NOT NULL THEN message.elapsedMs END), 0)",
        "avgLatencyMs",
      )
      .where("message.createdAt >= :start", { start })
      .setParameters({
        assistantRole: CHAT_MESSAGE_ROLE.ASSISTANT,
        failedStatus: "failed",
      })
      .groupBy(messageDate)
      .getRawMany<{
        date: Date | string;
        messages: string;
        activeUsers: string;
        tokens: string;
        errors: string;
        avgLatencyMs: string;
      }>();
    for (const row of messageRows) {
      const item = dailyMap.get(this.normalizeDate(row.date));
      if (!item) continue;
      item.messages = toNumber(row.messages);
      item.activeUsers = toNumber(row.activeUsers);
      item.tokens = toNumber(row.tokens);
      item.errors = toNumber(row.errors);
      item.avgLatencyMs = Math.round(toNumber(row.avgLatencyMs));
    }

    const appUsageRows = await this.sessionRepository
      .createQueryBuilder("session")
      .select("session.appId", "appId")
      .addSelect("COUNT(session.id)", "sessions")
      .where("session.createdAt >= :start", { start })
      .groupBy("session.appId")
      .orderBy("sessions", "DESC")
      .limit(5)
      .getRawMany<{ appId: string; sessions: string }>();
    const appIds = appUsageRows.map((row) => toNumber(row.appId));
    const apps = appIds.length
      ? await this.appRepository.find({ where: { id: In(appIds) } })
      : [];
    const appMap = new Map(apps.map((app) => [app.id, app.name]));

    const models = await this.llmRepository.find({ order: { id: "DESC" } });
    const health = models.map((model) => ({
      id: model.id,
      modelName: model.modelName,
      usageType: model.usageType,
      enabled: model.enabled,
      lastTestStatus: model.lastTestStatus,
      lastTestedAt: model.lastTestedAt,
      message: model.lastTestMessage,
      healthy: model.enabled && model.lastTestStatus !== LlmTestStatus.FAILED,
    }));

    return {
      range: { days: rangeDays, start: keys[0], end: keys[keys.length - 1] },
      overview: {
        totalUsers,
        activeUsers,
        totalApps,
        activeApps,
        publishedApps,
        totalPlugins,
        publishedPlugins,
        totalKnowledges,
        totalDocuments,
        totalChunks,
        enabledModels,
        failedDocuments,
      },
      daily: [...dailyMap.values()],
      topApps: appUsageRows.map((row) => ({
        appId: toNumber(row.appId),
        name: appMap.get(toNumber(row.appId)) ?? `应用 #${row.appId}`,
        sessions: toNumber(row.sessions),
      })),
      modelHealth: health,
    };
  }

  async listApps(
    query: QueryAdminResourcesDto,
  ): Promise<PageResult<AdminResourceItem>> {
    return this.listResource(this.appRepository, AiAppCategory, query, "app");
  }

  async listPlugins(
    query: QueryAdminResourcesDto,
  ): Promise<PageResult<AdminResourceItem>> {
    return this.listResource(
      this.pluginRepository,
      PluginCategory,
      query,
      "plugin",
    );
  }

  private async listResource(
    repository: Repository<AiApp | Plugin>,
    categoryEntity: typeof AiAppCategory | typeof PluginCategory,
    query: QueryAdminResourcesDto,
    alias: "app" | "plugin",
  ): Promise<PageResult<AdminResourceItem>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const queryBuilder = repository
      .createQueryBuilder(alias)
      .leftJoin(categoryEntity, "category", `category.id = ${alias}.categoryId`)
      .leftJoin(User, "owner", `owner.id = ${alias}.createdBy`)
      .select(`${alias}.id`, "id")
      .addSelect(`${alias}.name`, "name")
      .addSelect(`${alias}.description`, "description")
      .addSelect(`${alias}.status`, "status")
      .addSelect(`${alias}.published`, "published")
      .addSelect(`${alias}.createdBy`, "ownerId")
      .addSelect("owner.username", "ownerUsername")
      .addSelect("category.name", "categoryName")
      .addSelect(`${alias}.createdAt`, "createdAt")
      .addSelect(`${alias}.updatedAt`, "updatedAt")
      .orderBy(`${alias}.id`, "DESC");
    if (query.name?.trim())
      queryBuilder.andWhere(`${alias}.name LIKE :name`, {
        name: `%${query.name.trim()}%`,
      });
    if (query.status !== undefined)
      queryBuilder.andWhere(`${alias}.status = :status`, {
        status: query.status,
      });
    if (query.published !== undefined)
      queryBuilder.andWhere(`${alias}.published = :published`, {
        published: query.published,
      });

    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .skip(skip)
      .take(pageSize)
      .getRawMany<Record<string, unknown>>();
    return createPageResult(
      rows.map((row) => ({
        id: toNumber(row.id),
        name: String(row.name ?? ""),
        description: (row.description as string | null | undefined) ?? null,
        status: Boolean(row.status),
        published: Boolean(row.published),
        categoryName: (row.categoryName as string | null | undefined) ?? null,
        ownerId:
          row.ownerId === null || row.ownerId === undefined
            ? null
            : toNumber(row.ownerId),
        ownerUsername: (row.ownerUsername as string | null | undefined) ?? null,
        createdAt: row.createdAt as Date | string,
        updatedAt: row.updatedAt as Date | string,
      })),
      total,
      page,
      pageSize,
    );
  }

  async listKnowledges(query: QueryAdminResourcesDto): Promise<
    PageResult<
      AdminResourceItem & {
        documentCount: number;
        failedDocumentCount: number;
        chunkCount: number;
      }
    >
  > {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const queryBuilder = this.knowledgeRepository
      .createQueryBuilder("knowledge")
      .leftJoin(User, "owner", "owner.id = knowledge.createdBy")
      .select("knowledge.id", "id")
      .addSelect("knowledge.name", "name")
      .addSelect("knowledge.description", "description")
      .addSelect("knowledge.status", "status")
      .addSelect("knowledge.createdBy", "ownerId")
      .addSelect("owner.username", "ownerUsername")
      .addSelect("knowledge.createdAt", "createdAt")
      .addSelect("knowledge.updatedAt", "updatedAt")
      .orderBy("knowledge.id", "DESC");
    if (query.name?.trim())
      queryBuilder.andWhere("knowledge.name LIKE :name", {
        name: `%${query.name.trim()}%`,
      });
    if (query.status !== undefined)
      queryBuilder.andWhere("knowledge.status = :status", {
        status: query.status,
      });
    const total = await queryBuilder.clone().getCount();
    const rows = await queryBuilder
      .skip(skip)
      .take(pageSize)
      .getRawMany<Record<string, unknown>>();
    const ids = rows.map((row) => toNumber(row.id));
    const aggregates = ids.length
      ? await this.documentRepository
          .createQueryBuilder("document")
          .select("document.knowledgeId", "knowledgeId")
          .addSelect("COUNT(document.id)", "documentCount")
          .addSelect(
            "SUM(CASE WHEN document.parseStatus = :failed OR document.cleanStatus = :failed OR document.enhanceStatus = :failed OR document.chunkStatus = :failed OR document.embeddingStatus = :failed OR document.indexStatus = :failed THEN 1 ELSE 0 END)",
            "failedDocumentCount",
          )
          .where("document.knowledgeId IN (:...ids)", { ids })
          .setParameter("failed", "failed")
          .groupBy("document.knowledgeId")
          .getRawMany<{
            knowledgeId: string;
            documentCount: string;
            failedDocumentCount: string;
          }>()
      : [];
    const chunks = ids.length
      ? await this.chunkRepository
          .createQueryBuilder("chunk")
          .select("chunk.knowledgeId", "knowledgeId")
          .addSelect("COUNT(chunk.id)", "chunkCount")
          .where("chunk.knowledgeId IN (:...ids)", { ids })
          .groupBy("chunk.knowledgeId")
          .getRawMany<{ knowledgeId: string; chunkCount: string }>()
      : [];
    const documentsByKnowledge = new Map(
      aggregates.map((row) => [toNumber(row.knowledgeId), row]),
    );
    const chunksByKnowledge = new Map(
      chunks.map((row) => [
        toNumber(row.knowledgeId),
        toNumber(row.chunkCount),
      ]),
    );
    return createPageResult(
      rows.map((row) => {
        const id = toNumber(row.id);
        const aggregate = documentsByKnowledge.get(id);
        return {
          id,
          name: String(row.name ?? ""),
          description: (row.description as string | null | undefined) ?? null,
          status: Boolean(row.status),
          ownerId:
            row.ownerId === null || row.ownerId === undefined
              ? null
              : toNumber(row.ownerId),
          ownerUsername:
            (row.ownerUsername as string | null | undefined) ?? null,
          createdAt: row.createdAt as Date | string,
          updatedAt: row.updatedAt as Date | string,
          documentCount: toNumber(aggregate?.documentCount),
          failedDocumentCount: toNumber(aggregate?.failedDocumentCount),
          chunkCount: chunksByKnowledge.get(id) ?? 0,
        };
      }),
      total,
      page,
      pageSize,
    );
  }

  async updateApp(id: number, dto: UpdateAdminResourceDto, userId: number) {
    const app = await this.appRepository.findOne({ where: { id } });
    if (!app) throw new NotFoundException("AI应用不存在");
    Object.assign(app, dto, { updatedBy: userId });
    await this.appRepository.save(app);
    return { success: true };
  }

  async updatePlugin(id: number, dto: UpdateAdminResourceDto, userId: number) {
    const plugin = await this.pluginRepository.findOne({ where: { id } });
    if (!plugin) throw new NotFoundException("插件不存在");
    Object.assign(plugin, dto, { updatedBy: userId });
    await this.pluginRepository.save(plugin);
    return { success: true };
  }

  async updateKnowledge(
    id: number,
    dto: UpdateAdminResourceDto,
    userId: number,
  ) {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
    if (!knowledge) throw new NotFoundException("知识库不存在");
    Object.assign(knowledge, { status: dto.status, updatedBy: userId });
    await this.knowledgeRepository.save(knowledge);
    return { success: true };
  }
}
