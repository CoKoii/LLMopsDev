import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { normalizeCjkText } from "./cjk-normalize";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";
import { z } from "zod";
import { OssService } from "../../../common/oss/oss.service";
import { FilesService } from "../../files/files.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { DocumentProcessQueueService } from "./document-process-queue.service";
import { DocumentCleanerService } from "./document-cleaner/document-cleaner.service";
import { DocumentChunkerService } from "./document-chunker/document-chunker.service";
import type {
  DocumentChunkDraft,
  DocumentChunkMetadata,
} from "./document-chunker/document-chunker.types";
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentEnhancerService } from "./document-enhancer/document-enhancer.service";
import { DocumentParserService } from "./document-parser/document-parser.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import { CreateKnowledgeDocumentChunkDto } from "./dto/create-knowledge-document-chunk.dto";
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { CleanWebClipDto } from "./dto/clean-web-clip.dto";
import { QueryKnowledgeDocumentChunksDto } from "./dto/query-knowledge-document-chunks.dto";
import { QueryKnowledgeDocumentsDto } from "./dto/query-knowledge-documents.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { RecallTestDto } from "./dto/recall-test.dto";
import { ReprocessKnowledgeDocumentDto } from "./dto/reprocess-knowledge-document.dto";
import { UpdateKnowledgeDocumentChunkDto } from "./dto/update-knowledge-document-chunk.dto";
import { UpdateKnowledgeDocumentDto } from "./dto/update-knowledge-document.dto";
import { UpdateKnowledgeDto } from "./dto/update-knowledge.dto";
import {
  KnowledgeDocument,
  KnowledgeDocumentCleanStatus,
  KnowledgeDocumentChunkStatus,
  KnowledgeDocumentEmbeddingStatus,
  KnowledgeDocumentEnhanceStatus,
  KnowledgeDocumentIndexStatus,
  KnowledgeDocumentParseStatus,
} from "./entities/knowledge-document.entity";
import { KnowledgeDocumentChunk } from "./entities/knowledge-document-chunk.entity";
import { Knowledge } from "./entities/knowledge.entity";
import type { KnowledgeDocumentChunkConfig } from "./knowledge-document-process.types";
import {
  KnowledgeRecallService,
  type AppKnowledgeRecallItem,
  type AppKnowledgeRecallSettings,
} from "./knowledge-recall.service";
import { LlmUsageType } from "../llm/entities/llm.entity";
import { LlmService } from "../llm/llm.service";
import { LlmKeywordService } from "./llm-keyword.service";
import { estimateTokens } from "./token-estimator";

export type {
  AppKnowledgeRecallItem,
  AppKnowledgeRecallSettings,
} from "./knowledge-recall.service";

const escapeLikeValue = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const compactChunkText = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeChunkKeywords = (keywords: string[] | undefined) =>
  [...new Set((keywords ?? []).map(compactChunkText).filter(Boolean))].slice(
    0,
    10,
  );

const createChunkSearchText = (
  metadata: DocumentChunkMetadata | undefined,
  text: string,
) => {
  // 与分块器保持一致：检索/向量文本附带章节标题上下文，提升编辑后片段的召回质量。
  const headingPath =
    metadata?.sectionHeadingPath ?? metadata?.headingPath ?? [];
  const anchor = headingPath.filter(Boolean).join(" > ");

  return normalizeCjkText([anchor, text].filter(Boolean).join("\n\n"));
};

const WEB_CLIP_SYSTEM_PROMPT = [
  "你是网页文章清洗器。请把用户提供的网页片段整理为适合知识库检索的 Markdown。",
  "只保留文章主体、必要标题、正文层级、列表、表格、引用、代码块和关键链接。",
  "删除导航、广告、推荐阅读、评论区、登录提示、版权模板、分享按钮、无关侧栏和重复内容。",
  "不得编造原文没有的信息；不输出解释；只输出 Markdown 正文。",
].join("\n");

const WebClipCleanSchema = z
  .object({
    markdown: z.string().min(1),
  })
  .strict();

const MAX_WEB_CLIP_PROMPT_LENGTH = 60000;

const stripMarkdownFence = (value: string) =>
  value
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const normalizeMarkdownLines = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildFallbackWebClipMarkdown = (dto: CleanWebClipDto) => {
  const title = dto.title?.trim();
  const url = dto.url?.trim();
  const body = normalizeMarkdownLines(dto.markdown?.trim() || dto.text);

  return normalizeMarkdownLines(
    [title ? `# ${title}` : "", url ? `> 来源：${url}` : "", body]
      .filter(Boolean)
      .join("\n\n"),
  );
};

const compactForPrompt = (value: string) =>
  value.replace(/\s+\n/g, "\n").slice(0, MAX_WEB_CLIP_PROMPT_LENGTH);

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeDocumentChunk)
    private readonly chunkRepository: Repository<KnowledgeDocumentChunk>,
    private readonly filesService: FilesService,
    private readonly ossService: OssService,
    private readonly documentParserService: DocumentParserService,
    private readonly documentCleanerService: DocumentCleanerService,
    private readonly documentEnhancerService: DocumentEnhancerService,
    private readonly documentChunkerService: DocumentChunkerService,
    private readonly documentEmbeddingService: DocumentEmbeddingService,
    private readonly documentVectorStoreService: DocumentVectorStoreService,
    private readonly documentProcessQueueService: DocumentProcessQueueService,
    private readonly knowledgeRecallService: KnowledgeRecallService,
    private readonly llmService: LlmService,
    private readonly llmKeywordService: LlmKeywordService,
  ) {}

  private createWebClipModel() {
    return this.llmService.createDefaultChatModel(LlmUsageType.STRUCTURED, {
      maxRetries: 1,
      temperature: 0,
    });
  }

  async cleanWebClip(dto: CleanWebClipDto, userId: number) {
    void userId;

    if (!dto.text.trim() && !dto.markdown?.trim() && !dto.html?.trim()) {
      throw new BadRequestException("网页剪藏内容不能为空");
    }

    const fallbackMarkdown = buildFallbackWebClipMarkdown(dto);

    try {
      const model = (await this.createWebClipModel()).withStructuredOutput(
        WebClipCleanSchema,
        { name: "WebClipClean" },
      );
      const response = await model.invoke([
        ["system", WEB_CLIP_SYSTEM_PROMPT],
        [
          "human",
          [
            dto.title?.trim() ? `标题：${dto.title.trim()}` : "",
            dto.url?.trim() ? `来源：${dto.url.trim()}` : "",
            dto.markdown?.trim()
              ? `Markdown草稿：\n${compactForPrompt(dto.markdown.trim())}`
              : "",
            dto.text.trim()
              ? `可见文本：\n${compactForPrompt(dto.text.trim())}`
              : "",
            dto.html?.trim()
              ? `简化HTML：\n${compactForPrompt(dto.html.trim())}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        ],
      ]);
      const markdown = normalizeMarkdownLines(
        stripMarkdownFence(response.markdown),
      );

      return {
        markdown: markdown || fallbackMarkdown,
        cleanedBy: markdown ? "ai" : "rule",
        warning: markdown ? undefined : "已使用基础整理结果",
      };
    } catch {
      return {
        markdown: fallbackMarkdown,
        cleanedBy: "rule",
        warning: "已使用基础整理结果",
      };
    }
  }

  private withAccessibleIcon(knowledge: Knowledge): Knowledge {
    return {
      ...knowledge,
      icon: this.filesService.createAccessibleUrl(knowledge.icon),
    };
  }

  private withAccessibleDocumentUrl(
    document: KnowledgeDocument,
  ): KnowledgeDocument {
    const result = {
      ...document,
      url: this.filesService.createAccessibleUrl(document.url) ?? "",
    };
    // 解析/清洗/增强产物可达百 KB 且前端不消费，置空避免随接口返回。
    for (const key of [
      "parsedText",
      "parsedDocument",
      "cleanedText",
      "cleanedDocument",
      "enhancedText",
      "enhancedDocument",
    ] as const) {
      result[key] = undefined;
    }
    return result;
  }

  private async findOwnedKnowledge(id: number, userId: number) {
    const knowledge = await this.knowledgeRepository.findOne({
      where: { id, createdBy: userId },
    });
    if (!knowledge) throw new NotFoundException("知识库不存在");
    return knowledge;
  }

  private async findOwnedDocument(
    knowledgeId: number,
    documentId: number,
    userId: number,
  ) {
    await this.findOwnedKnowledge(knowledgeId, userId);

    const document = await this.documentRepository.findOne({
      where: { id: documentId, knowledgeId },
    });
    if (!document) throw new NotFoundException("文档不存在");

    return document;
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

  private resetParsedArtifacts(document: KnowledgeDocument) {
    document.parseError = null;
    document.parsedDocument = null;
    document.parsedText = null;
    document.parsedAt = null;
    document.cleanStatus = KnowledgeDocumentCleanStatus.PENDING;
    document.cleanError = null;
    document.cleanedDocument = null;
    document.cleanedText = null;
    document.cleanedAt = null;
    document.enhanceStatus = KnowledgeDocumentEnhanceStatus.PENDING;
    document.enhanceError = null;
    document.enhancedDocument = null;
    document.enhancedText = null;
    document.enhancedAt = null;
    this.resetIndexArtifacts(document);
  }

  private resetIndexArtifacts(document: KnowledgeDocument) {
    document.chunkStatus = KnowledgeDocumentChunkStatus.PENDING;
    document.chunkError = null;
    document.chunkCount = 0;
    document.chunkedAt = null;
    document.embeddingStatus = KnowledgeDocumentEmbeddingStatus.PENDING;
    document.embeddingError = null;
    document.embeddingModel = null;
    document.embeddingDimension = 0;
    document.embeddedAt = null;
    document.indexStatus = KnowledgeDocumentIndexStatus.PENDING;
    document.indexError = null;
    document.vectorCollection = null;
    document.indexedAt = null;
  }

  private async clearDocumentIndex(documentId: number) {
    await this.documentVectorStoreService.deleteDocumentPoints(documentId);
    await this.chunkRepository.delete({ documentId });
  }

  private async upsertChunkVector(
    document: KnowledgeDocument,
    chunk: KnowledgeDocumentChunk,
  ) {
    const embeddingResult = await this.documentEmbeddingService.embed([
      chunk.searchText || chunk.text,
    ]);
    const vector = embeddingResult.vectors[0] ?? [];

    await this.documentVectorStoreService.ensureCollection(
      embeddingResult.dimension,
    );

    chunk.embeddingModel = embeddingResult.model;
    chunk.embeddingDimension = embeddingResult.dimension;
    chunk.vectorId ||= randomUUID();
    const savedChunk = await this.chunkRepository.save(chunk);

    await this.documentVectorStoreService.upsert([
      {
        id: savedChunk.vectorId,
        vector,
        payload: {
          knowledgeId: savedChunk.knowledgeId,
          documentId: savedChunk.documentId,
          documentName: document.name,
          chunkId: savedChunk.id,
          chunkIndex: savedChunk.chunkIndex,
          text: savedChunk.text,
          searchText: savedChunk.searchText,
          enabled: savedChunk.enabled,
          metadata: savedChunk.metadata,
        },
      },
    ]);

    return savedChunk;
  }

  private createManualChunkMetadata(
    document: KnowledgeDocument,
    chunkIndex: number,
    text: string,
    keywords: string[],
  ): DocumentChunkMetadata {
    return {
      knowledgeId: document.knowledgeId,
      documentId: document.id,
      documentName: document.name,
      documentTitle: document.name,
      contentType: document.contentType,
      format: document.parsedDocument?.format ?? "manual",
      chunkIndex,
      sectionTitle: "手动片段",
      headingPath: ["手动片段"],
      sourceBlockIds: [],
      blockTypes: ["paragraph"],
      pages: [],
      tokenCount: estimateTokens(text),
      characterCount: text.length,
      overlapFromPrevious: false,
      keywords,
      documentKeywords: document.enhancedDocument?.metadata.keywords ?? [],
    };
  }

  private async syncDocumentChunkCount(documentId: number) {
    const chunkCount = await this.chunkRepository.count({
      where: { documentId },
    });
    await this.documentRepository.update({ id: documentId }, { chunkCount });
    return chunkCount;
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
    await this.documentVectorStoreService.deleteKnowledgePoints(id);
    await this.chunkRepository.delete({ knowledgeId: id });
    await this.documentRepository.delete({ knowledgeId: id });
    await this.knowledgeRepository.softRemove(knowledge);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取知识库文档列表
  async listDocuments(
    knowledgeId: number,
    query: QueryKnowledgeDocumentsDto,
    userId: number,
  ): Promise<PageResult<KnowledgeDocument>> {
    await this.findOwnedKnowledge(knowledgeId, userId);

    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.documentRepository
      .createQueryBuilder("document")
      .where("document.knowledgeId = :knowledgeId", { knowledgeId })
      .orderBy("document.id", "DESC")
      .skip(skip)
      .take(pageSize);

    if (name) {
      queryBuilder.andWhere("document.name LIKE :name", {
        name: `%${name}%`,
      });
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(
      items.map((item) => this.withAccessibleDocumentUrl(item)),
      total,
      page,
      pageSize,
    );
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 召回测试
  async recallTest(knowledgeId: number, dto: RecallTestDto, userId: number) {
    await this.findOwnedKnowledge(knowledgeId, userId);
    return this.knowledgeRecallService.recallTest(knowledgeId, dto);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // AI应用知识库召回
  async recallForApp(params: {
    knowledgeIds: number[];
    settings?: AppKnowledgeRecallSettings;
    query: string;
    userId: number;
  }): Promise<AppKnowledgeRecallItem[]> {
    return this.knowledgeRecallService.recallForApp(params);
  }

  async recallForAppWithUsage(params: {
    knowledgeIds: number[];
    settings?: AppKnowledgeRecallSettings;
    query: string;
    userId: number;
  }) {
    return this.knowledgeRecallService.recallForAppWithUsage(params);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取知识库文档详情
  async findDocument(knowledgeId: number, documentId: number, userId: number) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );
    return this.withAccessibleDocumentUrl(document);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 获取文档片段列表
  async listDocumentChunks(
    knowledgeId: number,
    documentId: number,
    query: QueryKnowledgeDocumentChunksDto,
    userId: number,
  ): Promise<PageResult<KnowledgeDocumentChunk>> {
    await this.findOwnedDocument(knowledgeId, documentId, userId);

    const { page, pageSize, skip } = resolvePageQuery(query);
    const keyword = query.keyword?.trim();
    const queryBuilder = this.chunkRepository
      .createQueryBuilder("chunk")
      .where("chunk.knowledgeId = :knowledgeId", { knowledgeId })
      .andWhere("chunk.documentId = :documentId", { documentId })
      .orderBy("chunk.chunkIndex", "ASC")
      .skip(skip)
      .take(pageSize);

    if (keyword) {
      queryBuilder.andWhere(
        "(chunk.text LIKE :keyword OR chunk.searchText LIKE :keyword)",
        { keyword: `%${escapeLikeValue(keyword)}%` },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();
    return createPageResult(items, total, page, pageSize);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 添加文档片段
  async createDocumentChunk(
    knowledgeId: number,
    documentId: number,
    dto: CreateKnowledgeDocumentChunkDto,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );
    const text = dto.text.trim();
    if (!text) throw new BadRequestException("片段内容不能为空");

    const maxChunk = await this.chunkRepository.findOne({
      where: { knowledgeId, documentId },
      order: { chunkIndex: "DESC" },
    });
    const chunkIndex = (maxChunk?.chunkIndex ?? -1) + 1;
    const keywords = normalizeChunkKeywords(dto.keywords);
    const metadata = this.createManualChunkMetadata(
      document,
      chunkIndex,
      text,
      keywords,
    );
    const chunk = this.chunkRepository.create({
      knowledgeId,
      documentId,
      chunkIndex,
      text,
      searchText: createChunkSearchText(metadata, text),
      tokenCount: metadata.tokenCount,
      characterCount: metadata.characterCount,
      recallCount: 0,
      enabled: true,
      embeddingModel: document.embeddingModel ?? "",
      embeddingDimension: document.embeddingDimension,
      vectorId: randomUUID(),
      metadata,
      createdBy: userId,
      updatedBy: userId,
    });

    const savedChunk = await this.upsertChunkVector(document, chunk);
    await this.syncDocumentChunkCount(documentId);
    return savedChunk;
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新文档片段
  async updateDocumentChunk(
    knowledgeId: number,
    documentId: number,
    chunkId: number,
    dto: UpdateKnowledgeDocumentChunkDto,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );
    const chunk = await this.chunkRepository.findOne({
      where: { id: chunkId, knowledgeId, documentId },
    });
    if (!chunk) throw new NotFoundException("文档片段不存在");

    const nextText = dto.text?.trim();
    const shouldUpdateVector =
      nextText !== undefined && nextText !== chunk.text;

    if (nextText !== undefined) {
      if (!nextText) throw new BadRequestException("片段内容不能为空");
      chunk.text = nextText;
      chunk.tokenCount = estimateTokens(nextText);
      chunk.characterCount = nextText.length;
      chunk.metadata = {
        ...chunk.metadata,
        tokenCount: chunk.tokenCount,
        characterCount: chunk.characterCount,
      };
      chunk.searchText = createChunkSearchText(chunk.metadata, nextText);
    }

    if (dto.keywords !== undefined) {
      chunk.metadata = {
        ...chunk.metadata,
        keywords: normalizeChunkKeywords(dto.keywords),
      };
    }

    if (dto.enabled !== undefined) {
      chunk.enabled = dto.enabled;
    }

    chunk.updatedBy = userId;

    return shouldUpdateVector
      ? this.upsertChunkVector(document, chunk)
      : this.chunkRepository.save(chunk);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除文档片段
  async removeDocumentChunk(
    knowledgeId: number,
    documentId: number,
    chunkId: number,
    userId: number,
  ) {
    await this.findOwnedDocument(knowledgeId, documentId, userId);
    const chunk = await this.chunkRepository.findOne({
      where: { id: chunkId, knowledgeId, documentId },
    });
    if (!chunk) throw new NotFoundException("文档片段不存在");

    await this.documentVectorStoreService.deleteChunkPoint(chunk.id);
    await this.chunkRepository.remove(chunk);
    await this.syncDocumentChunkCount(documentId);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 添加知识库文档
  async createDocument(
    knowledgeId: number,
    dto: CreateKnowledgeDocumentDto,
    userId: number,
  ) {
    await this.findOwnedKnowledge(knowledgeId, userId);

    const existingDocument = await this.documentRepository.findOne({
      where: { knowledgeId, fileId: dto.fileId },
    });
    if (existingDocument) {
      throw new ConflictException("该文件已添加到知识库");
    }

    const file = await this.filesService.markUsed(dto.fileId, userId);
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        knowledgeId,
        fileId: file.id,
        name: file.originalName,
        contentType: file.contentType,
        size: file.size,
        objectKey: file.objectKey,
        url: file.url,
        enabled: true,
        parseStatus: KnowledgeDocumentParseStatus.PARSING,
        cleanStatus: KnowledgeDocumentCleanStatus.PENDING,
        enhanceStatus: KnowledgeDocumentEnhanceStatus.PENDING,
        chunkStatus: KnowledgeDocumentChunkStatus.PENDING,
        embeddingStatus: KnowledgeDocumentEmbeddingStatus.PENDING,
        indexStatus: KnowledgeDocumentIndexStatus.PENDING,
      }),
    );

    try {
      await this.documentProcessQueueService.enqueue({
        knowledgeId,
        documentId: document.id,
        userId,
        chunkConfig: dto.chunkConfig,
      });
    } catch (error) {
      this.applyProcessError(document, error);
      await this.documentRepository.save(document);
      throw error;
    }

    return this.withAccessibleDocumentUrl(document);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 重新处理知识库文档
  async reprocessDocument(
    knowledgeId: number,
    documentId: number,
    dto: ReprocessKnowledgeDocumentDto | undefined,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );

    await this.documentProcessQueueService.enqueue({
      knowledgeId,
      documentId,
      userId,
      chunkConfig: dto?.chunkConfig,
    });

    return this.withAccessibleDocumentUrl(document);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 更新知识库文档
  async updateDocument(
    knowledgeId: number,
    documentId: number,
    dto: UpdateKnowledgeDocumentDto,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );
    const name = dto.name?.trim();

    if (dto.name !== undefined && name) {
      document.name = name;
    }
    if (dto.enabled !== undefined) {
      document.enabled = dto.enabled;
    }

    return this.withAccessibleDocumentUrl(
      await this.documentRepository.save(document),
    );
  }

  // 用模型为每个片段生成检索关键词（与“用户问题建议”同一模型：STRUCTURED），
  // 失败时保留 chunker 的规则版关键词，不影响文档处理流程。
  private async enrichChunkKeywords(chunks: DocumentChunkDraft[]) {
    try {
      const keywordsByIndex =
        await this.llmKeywordService.extractChunkKeywordsBatch(
          chunks.map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            headingPath: chunk.metadata.headingPath ?? [],
            text: chunk.text,
          })),
        );
      if (keywordsByIndex.size) {
        for (const chunk of chunks) {
          const keywords = keywordsByIndex.get(chunk.chunkIndex);
          if (keywords?.length) chunk.metadata.keywords = keywords;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`片段关键词模型生成失败，保留规则版：${message}`);
    }
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 删除知识库文档
  async removeDocument(
    knowledgeId: number,
    documentId: number,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );
    await this.clearDocumentIndex(documentId);
    await this.documentRepository.softRemove(document);
    return { success: true };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 执行知识库文档处理任务
  async executeDocumentProcess(
    knowledgeId: number,
    documentId: number,
    userId: number,
    chunkConfig?: KnowledgeDocumentChunkConfig,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );

    document.parseStatus = KnowledgeDocumentParseStatus.PARSING;
    this.resetParsedArtifacts(document);
    await this.documentRepository.save(document);

    try {
      await this.clearDocumentIndex(documentId);

      const buffer = await this.ossService.getObjectBuffer(document.objectKey);
      const parsedDocument = await this.documentParserService.parse({
        filename: document.name,
        contentType: document.contentType,
        buffer,
      });

      document.parseStatus = KnowledgeDocumentParseStatus.PARSED;
      document.parseError = null;
      document.parsedDocument = parsedDocument;
      document.parsedText = parsedDocument.text;
      document.characterCount = parsedDocument.characterCount;
      document.parsedAt = new Date();
      await this.documentRepository.save(document);

      document.cleanStatus = KnowledgeDocumentCleanStatus.CLEANING;
      document.cleanError = null;
      await this.documentRepository.save(document);
      const { document: cleanedDocument } = this.documentCleanerService.clean(
        parsedDocument,
        chunkConfig,
      );

      document.cleanStatus = KnowledgeDocumentCleanStatus.CLEANED;
      document.cleanError = null;
      document.cleanedDocument = cleanedDocument;
      document.cleanedText = cleanedDocument.text;
      document.characterCount = cleanedDocument.characterCount;
      document.cleanedAt = new Date();
      await this.documentRepository.save(document);

      document.enhanceStatus = KnowledgeDocumentEnhanceStatus.ENHANCING;
      document.enhanceError = null;
      await this.documentRepository.save(document);
      const { document: enhancedDocument } =
        this.documentEnhancerService.enhance(cleanedDocument);
      // 用模型生成文档级关键词（与“用户问题建议”同一模型：STRUCTURED），失败时保留规则版
      try {
        const keywords = await this.llmKeywordService.extractDocumentKeywords({
          title: enhancedDocument.title,
          summary: enhancedDocument.metadata.summary,
          headings: enhancedDocument.blocks
            .filter((block) => block.type === "heading")
            .map((block) => block.text),
        });
        if (keywords.length) {
          enhancedDocument.metadata.keywords = keywords;
          enhancedDocument.metadata.enhancementRules.push(
            "extract-llm-keywords",
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`文档关键词模型生成失败，保留规则版：${message}`);
      }

      document.enhanceStatus = KnowledgeDocumentEnhanceStatus.ENHANCED;
      document.enhanceError = null;
      document.enhancedDocument = enhancedDocument;
      document.enhancedText = enhancedDocument.text;
      document.characterCount = enhancedDocument.characterCount;
      document.enhancedAt = new Date();
      await this.documentRepository.save(document);

      document.chunkStatus = KnowledgeDocumentChunkStatus.CHUNKING;
      document.chunkError = null;
      await this.documentRepository.save(document);
      const chunks = this.documentChunkerService.createChunks({
        knowledgeId,
        documentId,
        documentName: document.name,
        contentType: document.contentType,
        document: enhancedDocument,
        chunkConfig,
      });
      // 按章节用模型生成片段关键词（失败时保留规则版），供检索精确召回与加权
      await this.enrichChunkKeywords(chunks);
      const documentKeywords = enhancedDocument.metadata.keywords ?? [];

      document.chunkStatus = KnowledgeDocumentChunkStatus.CHUNKED;
      document.chunkError = null;
      document.chunkCount = chunks.length;
      document.chunkedAt = new Date();
      await this.documentRepository.save(document);

      document.embeddingStatus = KnowledgeDocumentEmbeddingStatus.QUEUED;
      document.embeddingError = null;
      await this.documentRepository.save(document);
      const embeddingResult = await this.documentEmbeddingService.embed(
        chunks.map((chunk) => chunk.embeddingText),
        {
          onStart: async () => {
            document.embeddingStatus =
              KnowledgeDocumentEmbeddingStatus.EMBEDDING;
            document.embeddingError = null;
            await this.documentRepository.save(document);
          },
        },
      );
      if (embeddingResult.vectors.length !== chunks.length) {
        throw new BadGatewayException(
          `向量数量与分块数量不一致：${embeddingResult.vectors.length}/${chunks.length}`,
        );
      }

      document.embeddingStatus = KnowledgeDocumentEmbeddingStatus.EMBEDDED;
      document.embeddingError = null;
      document.embeddingModel = embeddingResult.model;
      document.embeddingDimension = embeddingResult.dimension;
      document.embeddedAt = new Date();
      await this.documentRepository.save(document);

      document.indexStatus = KnowledgeDocumentIndexStatus.INDEXING;
      document.indexError = null;
      await this.documentRepository.save(document);
      await this.documentVectorStoreService.ensureCollection(
        embeddingResult.dimension,
      );
      const savedChunks = await this.chunkRepository.save(
        chunks.map((chunk) =>
          this.chunkRepository.create({
            knowledgeId,
            documentId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            searchText: chunk.searchText,
            tokenCount: chunk.tokenCount,
            characterCount: chunk.characterCount,
            recallCount: 0,
            enabled: true,
            embeddingModel: embeddingResult.model,
            embeddingDimension: embeddingResult.dimension,
            vectorId: randomUUID(),
            metadata: {
              ...chunk.metadata,
              documentKeywords,
            },
            createdBy: userId,
            updatedBy: userId,
          }),
        ),
      );
      try {
        await this.documentVectorStoreService.upsert(
          savedChunks.map((chunk, index) => ({
            id: chunk.vectorId,
            vector: embeddingResult.vectors[index] ?? [],
            payload: {
              knowledgeId,
              documentId,
              documentName: document.name,
              chunkId: chunk.id,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              searchText: chunk.searchText,
              enabled: chunk.enabled,
              metadata: chunk.metadata,
            },
          })),
        );
      } catch (error) {
        // 向量写入失败时回滚已入库的片段，避免 DB 与向量库不一致。
        await this.chunkRepository.delete({
          id: In(savedChunks.map((chunk) => chunk.id)),
        });
        throw error;
      }

      document.indexStatus = KnowledgeDocumentIndexStatus.INDEXED;
      document.indexError = null;
      document.vectorCollection = this.documentVectorStoreService.collection;
      document.indexedAt = new Date();
    } catch (error) {
      this.applyProcessError(document, error);
    }

    return this.withAccessibleDocumentUrl(
      await this.documentRepository.save(document),
    );
  }
  // --------------------------------------------------------------------------------------------------

  private applyProcessError(document: KnowledgeDocument, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();

    if (document.parseStatus === KnowledgeDocumentParseStatus.PARSING) {
      document.parseStatus = KnowledgeDocumentParseStatus.FAILED;
      document.parseError = message;
      document.characterCount = 0;
      document.parsedAt = failedAt;
      return;
    }

    if (document.cleanStatus === KnowledgeDocumentCleanStatus.CLEANING) {
      document.cleanStatus = KnowledgeDocumentCleanStatus.FAILED;
      document.cleanError = message;
      document.cleanedAt = failedAt;
      return;
    }

    if (document.enhanceStatus === KnowledgeDocumentEnhanceStatus.ENHANCING) {
      document.enhanceStatus = KnowledgeDocumentEnhanceStatus.FAILED;
      document.enhanceError = message;
      document.enhancedAt = failedAt;
      return;
    }

    if (document.chunkStatus === KnowledgeDocumentChunkStatus.CHUNKING) {
      document.chunkStatus = KnowledgeDocumentChunkStatus.FAILED;
      document.chunkError = message;
      document.chunkedAt = failedAt;
      return;
    }

    if (
      document.embeddingStatus === KnowledgeDocumentEmbeddingStatus.QUEUED ||
      document.embeddingStatus === KnowledgeDocumentEmbeddingStatus.EMBEDDING
    ) {
      document.embeddingStatus = KnowledgeDocumentEmbeddingStatus.FAILED;
      document.embeddingError = message;
      document.embeddedAt = failedAt;
      return;
    }

    document.indexStatus = KnowledgeDocumentIndexStatus.FAILED;
    document.indexError = message;
    document.indexedAt = failedAt;
  }
}
