import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";
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
import type { DocumentChunkMetadata } from "./document-chunker/document-chunker.types";
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentEnhancerService } from "./document-enhancer/document-enhancer.service";
import { DocumentParserService } from "./document-parser/document-parser.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import { CreateKnowledgeDocumentChunkDto } from "./dto/create-knowledge-document-chunk.dto";
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { QueryKnowledgeDocumentChunksDto } from "./dto/query-knowledge-document-chunks.dto";
import { QueryKnowledgeDocumentsDto } from "./dto/query-knowledge-documents.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { RecallTestDto } from "./dto/recall-test.dto";
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

interface RecallMatch {
  chunkId: number;
  score: number;
  source: "vector" | "text" | "hybrid";
  vectorScore?: number;
  textScore?: number;
}

type KnowledgeRecallStrategy = "hybrid" | "vector" | "text";

export interface AppKnowledgeRecallSettings {
  strategy?: KnowledgeRecallStrategy;
  limit?: number;
  minScore?: number;
}

export interface AppKnowledgeRecallItem {
  knowledgeId: number;
  knowledgeName: string;
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  score: number;
  source: KnowledgeRecallStrategy;
  text: string;
  searchText: string;
  metadata: Record<string, unknown>;
}

interface KnowledgeRecallResultItem extends Omit<
  AppKnowledgeRecallItem,
  "knowledgeId" | "knowledgeName"
> {
  source: KnowledgeRecallStrategy;
}

type KnowledgeRecallExecutionOptions = {
  queryVector?: number[];
};

const clampScore = (score: number) =>
  Math.max(0, Math.min(1, Number(score.toFixed(4))));

const escapeLikeValue = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const normalizeRecallText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const uniqueStrings = (items: string[]) => [...new Set(items)];

const extractRecallTerms = (query: string) => {
  const normalizedQuery = normalizeRecallText(query);
  const terms: string[] = [];

  terms.push(
    ...Array.from(
      normalizedQuery.matchAll(/[A-Za-z][A-Za-z0-9_./+-]{1,}/g),
      (match) => match[0].toLowerCase(),
    ),
  );

  for (const match of normalizedQuery.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const word = match[0];
    if (word.length <= 6) terms.push(word);

    for (let index = 0; index <= word.length - 2; index += 1) {
      terms.push(word.slice(index, index + 2));
    }
  }

  return uniqueStrings(
    terms.map((term) => term.trim()).filter((term) => term.length >= 2),
  );
};
const limitRecallTerms = (terms: string[]) => terms.slice(0, 16);

const recallTermWeight = (term: string) =>
  /[\u3400-\u9fff]/.test(term)
    ? Math.min(term.length, 6)
    : Math.min(Math.ceil(term.length / 2), 6);

const looksLikeMetadataBlock = (text: string) =>
  /^\s*[A-Za-z][\w.-]{1,40}\s*:/u.test(text);

const estimateChunkTokens = (text: string) => {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9_./:-]+/g)?.length ?? 0;
  const other = Math.max(0, text.length - cjkCount);
  return Math.max(1, Math.ceil(cjkCount + words * 1.25 + other * 0.08));
};

const compactChunkText = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeChunkKeywords = (keywords: string[] | undefined) =>
  [...new Set((keywords ?? []).map(compactChunkText).filter(Boolean))].slice(
    0,
    10,
  );

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
  ) {}

  private withAccessibleIcon(knowledge: Knowledge): Knowledge {
    return {
      ...knowledge,
      icon: this.filesService.createAccessibleUrl(knowledge.icon),
    };
  }

  private withAccessibleDocumentUrl(
    document: KnowledgeDocument,
    options: { includeParsed?: boolean } = {},
  ): KnowledgeDocument {
    const result = {
      ...document,
      url: this.filesService.createAccessibleUrl(document.url) ?? "",
    };

    if (!options.includeParsed) {
      result.parsedText = undefined;
      result.parsedDocument = undefined;
      result.cleanedText = undefined;
      result.cleanedDocument = undefined;
      result.enhancedText = undefined;
      result.enhancedDocument = undefined;
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

  private createChunkSearchText(chunk: KnowledgeDocumentChunk) {
    const headingPath = chunk.metadata.headingPath ?? [];
    return [
      headingPath.length ? `章节：${headingPath.join(" / ")}` : undefined,
      chunk.text,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private createChunkEmbeddingText(
    document: KnowledgeDocument,
    chunk: KnowledgeDocumentChunk,
  ) {
    const headingPath = chunk.metadata.headingPath ?? [];
    return [
      `文档：${document.name}`,
      headingPath.length ? `章节：${headingPath.join(" / ")}` : undefined,
      chunk.text,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async upsertChunkVector(
    document: KnowledgeDocument,
    chunk: KnowledgeDocumentChunk,
  ) {
    const embeddingResult = await this.documentEmbeddingService.embed([
      this.createChunkEmbeddingText(document, chunk),
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
      tokenCount: estimateChunkTokens(text),
      characterCount: text.length,
      overlapFromPrevious: false,
      keywords,
    };
  }

  private async syncDocumentChunkCount(documentId: number) {
    const chunkCount = await this.chunkRepository.count({
      where: { documentId },
    });
    await this.documentRepository.update({ id: documentId }, { chunkCount });
    return chunkCount;
  }

  private async createQueryVector(query: string) {
    const embeddingResult = await this.documentEmbeddingService.embed([query]);
    return embeddingResult.vectors[0] ?? [];
  }

  private async searchVectorRecall(
    knowledgeId: number,
    query: string,
    limit: number,
    minScore: number,
    queryVector?: number[],
  ): Promise<RecallMatch[]> {
    const vector = queryVector ?? (await this.createQueryVector(query));
    const points = await this.documentVectorStoreService.search({
      vector,
      knowledgeId,
      limit,
      scoreThreshold: minScore || undefined,
    });

    return points.map((point) => ({
      chunkId: point.payload.chunkId,
      score: point.score,
      vectorScore: point.score,
      source: "vector",
    }));
  }

  private async searchTextRecall(
    knowledgeId: number,
    query: string,
    limit: number,
    minScore: number,
  ): Promise<RecallMatch[]> {
    const terms = limitRecallTerms(extractRecallTerms(query));
    if (!terms.length) return [];

    const params = Object.fromEntries(
      terms.map((term, index) => [
        `term${index}`,
        `%${escapeLikeValue(term)}%`,
      ]),
    );
    const rankExpression = terms
      .map(
        (term, index) =>
          `CASE WHEN LOWER(chunk.searchText) LIKE :term${index} THEN ${recallTermWeight(term)} ELSE 0 END`,
      )
      .join(" + ");
    const chunks = await this.chunkRepository
      .createQueryBuilder("chunk")
      .innerJoin("chunk.document", "document")
      .where("chunk.knowledgeId = :knowledgeId", { knowledgeId })
      .andWhere("chunk.enabled = :chunkEnabled", { chunkEnabled: true })
      .andWhere("document.enabled = :enabled", { enabled: true })
      .andWhere(
        `(${terms
          .map((_, index) => `LOWER(chunk.searchText) LIKE :term${index}`)
          .join(" OR ")})`,
        params,
      )
      .addSelect(`(${rankExpression})`, "lexical_rank")
      .orderBy("lexical_rank", "DESC")
      .addOrderBy("chunk.id", "DESC")
      .take(limit)
      .getMany();

    return chunks
      .map((chunk) => ({
        chunk,
        score: this.calculateRecallLexicalScore(query, chunk),
      }))
      .sort((left, right) => right.score - left.score)
      .map(({ chunk, score }) => {
        return {
          chunkId: chunk.id,
          score,
          textScore: score,
          source: "text" as const,
        };
      })
      .filter((item) => item.score >= minScore);
  }

  private calculateRecallLexicalScore(
    query: string,
    chunk: KnowledgeDocumentChunk,
  ) {
    const terms = extractRecallTerms(query);
    if (!terms.length) return 0;

    const text = normalizeRecallText(chunk.searchText || chunk.text);
    const headingText = normalizeRecallText(
      chunk.metadata.headingPath.join(" "),
    );
    let matchedWeight = 0;
    let totalWeight = 0;

    for (const term of terms) {
      const weight = recallTermWeight(term);
      totalWeight += weight;

      if (text.includes(term)) {
        matchedWeight += weight;
        continue;
      }
      if (headingText.includes(term)) {
        matchedWeight += weight * 0.65;
      }
    }

    const effectiveTotalWeight = Math.min(totalWeight, 10);
    return effectiveTotalWeight
      ? Math.min(1, matchedWeight / effectiveTotalWeight)
      : 0;
  }

  private calculateRecallRankScore(
    query: string,
    match: RecallMatch,
    chunk: KnowledgeDocumentChunk,
  ) {
    const lexicalScore = this.calculateRecallLexicalScore(query, chunk);
    const isCodeOnly =
      chunk.metadata.blockTypes.length > 0 &&
      chunk.metadata.blockTypes.every((type) => type === "code");
    const metadataPenalty = looksLikeMetadataBlock(chunk.text) ? 0.22 : 0;
    const shortTextPenalty = chunk.text.length < 60 ? 0.06 : 0;
    const codePenalty = isCodeOnly && lexicalScore < 0.6 ? 0.12 : 0;
    const vectorScore = match.vectorScore ?? 0;
    const textScore = match.textScore ?? lexicalScore;
    const baseScore = vectorScore ? vectorScore + textScore * 0.04 : textScore;

    return baseScore - metadataPenalty - shortTextPenalty - codePenalty;
  }

  private mergeRecallMatches(matches: RecallMatch[], limit: number) {
    const matchMap = new Map<number, RecallMatch>();

    for (const match of matches) {
      const existing = matchMap.get(match.chunkId);
      if (!existing) {
        matchMap.set(match.chunkId, match);
        continue;
      }

      matchMap.set(match.chunkId, {
        chunkId: match.chunkId,
        score: Math.max(existing.score, match.score),
        source: existing.source === match.source ? match.source : "hybrid",
        vectorScore: Math.max(
          existing.vectorScore ?? 0,
          match.vectorScore ?? 0,
        ),
        textScore: Math.max(existing.textScore ?? 0, match.textScore ?? 0),
      });
    }

    return [...matchMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private normalizeRecallSettings(settings: AppKnowledgeRecallSettings = {}) {
    const strategy = settings.strategy ?? "hybrid";
    const limit = Math.min(20, Math.max(1, Math.floor(settings.limit ?? 5)));
    const minScore = Math.min(1, Math.max(0, settings.minScore ?? 0.4));

    return { strategy, limit, minScore };
  }

  private async executeRecall(
    knowledgeId: number,
    query: string,
    settings: AppKnowledgeRecallSettings = {},
    options: KnowledgeRecallExecutionOptions = {},
  ) {
    const { strategy, limit, minScore } =
      this.normalizeRecallSettings(settings);
    const recallLimit =
      strategy === "vector" ? limit : Math.min(200, Math.max(limit * 12, 60));
    const recallTasks: Array<Promise<RecallMatch[]>> = [];

    if (strategy === "hybrid" || strategy === "vector") {
      recallTasks.push(
        this.searchVectorRecall(
          knowledgeId,
          query,
          recallLimit,
          minScore,
          options.queryVector,
        ),
      );
    }

    if (strategy === "hybrid" || strategy === "text") {
      recallTasks.push(
        this.searchTextRecall(knowledgeId, query, recallLimit, minScore),
      );
    }

    const matches = (await Promise.all(recallTasks)).flat();
    const mergedMatches = this.mergeRecallMatches(matches, recallLimit);
    const chunks = mergedMatches.length
      ? await this.chunkRepository.find({
          where: {
            id: In(mergedMatches.map((item) => item.chunkId)),
            knowledgeId,
          },
          relations: { document: true },
        })
      : [];
    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const items = mergedMatches
      .map((match) => {
        const chunk = chunkMap.get(match.chunkId);
        if (!chunk?.enabled || !chunk.document?.enabled) return undefined;
        const rankScore = this.calculateRecallRankScore(query, match, chunk);

        return {
          rankScore,
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: chunk.document.name,
          chunkIndex: chunk.chunkIndex,
          score: clampScore(rankScore),
          source: match.source,
          text: chunk.text,
          searchText: chunk.searchText,
          metadata: chunk.metadata as unknown as Record<string, unknown>,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.rankScore - left.rankScore)
      .slice(0, limit)
      .map((item) => ({
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentName: item.documentName,
        chunkIndex: item.chunkIndex,
        score: item.score,
        source: item.source,
        text: item.text,
        searchText: item.searchText,
        metadata: item.metadata,
      }));

    return {
      strategy,
      limit,
      minScore,
      items,
    };
  }

  private async incrementRecallCounts(
    knowledgeId: number,
    items: Array<Pick<KnowledgeRecallResultItem, "documentId" | "chunkId">>,
  ) {
    const documentIds = [...new Set(items.map((item) => item.documentId))];
    if (documentIds.length) {
      await this.documentRepository.increment(
        { id: In(documentIds), knowledgeId },
        "recallCount",
        1,
      );
    }
    const chunkIds = items.map((item) => item.chunkId);
    if (chunkIds.length) {
      await this.chunkRepository.increment(
        { id: In(chunkIds), knowledgeId },
        "recallCount",
        1,
      );
    }
  }

  private scheduleRecallCountIncrement(
    knowledgeId: number,
    items: Array<Pick<KnowledgeRecallResultItem, "documentId" | "chunkId">>,
  ) {
    if (!items.length) return;

    void this.incrementRecallCounts(knowledgeId, items).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.warn(`知识库召回次数更新失败: ${message}`, stack);
    });
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

    const query = dto.query.trim();
    if (!query) throw new BadRequestException("检索文本不能为空");

    const { strategy, limit, minScore, items } = await this.executeRecall(
      knowledgeId,
      query,
      dto,
    );
    await this.incrementRecallCounts(knowledgeId, items);

    return {
      query,
      strategy,
      limit,
      minScore,
      items,
    };
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // AI应用知识库召回
  async recallForApp(params: {
    knowledgeIds: number[];
    settings?: Record<number, AppKnowledgeRecallSettings>;
    query: string;
    userId: number;
  }): Promise<AppKnowledgeRecallItem[]> {
    const query = params.query.trim();
    if (!query || !params.knowledgeIds.length) return [];

    const knowledgeIds = [...new Set(params.knowledgeIds)].slice(0, 5);
    const knowledges = await this.knowledgeRepository.find({
      where: {
        id: In(knowledgeIds),
        createdBy: params.userId,
        status: true,
      },
    });
    const knowledgeMap = new Map(knowledges.map((item) => [item.id, item]));
    const accessibleKnowledgeIds = knowledgeIds.filter((knowledgeId) =>
      knowledgeMap.has(knowledgeId),
    );
    const needsQueryVector = accessibleKnowledgeIds.some((knowledgeId) => {
      const { strategy } = this.normalizeRecallSettings(
        params.settings?.[knowledgeId],
      );
      return strategy === "hybrid" || strategy === "vector";
    });
    const queryVector = needsQueryVector
      ? await this.createQueryVector(query)
      : undefined;
    const results = (
      await Promise.all(
        accessibleKnowledgeIds.map(async (knowledgeId) => {
          const knowledge = knowledgeMap.get(knowledgeId);
          if (!knowledge) return [];

          const recallResult = await this.executeRecall(
            knowledgeId,
            query,
            params.settings?.[knowledgeId],
            { queryVector },
          );
          this.scheduleRecallCountIncrement(knowledgeId, recallResult.items);

          return recallResult.items.map((item) => ({
            ...item,
            knowledgeId,
            knowledgeName: knowledge.name,
          }));
        }),
      )
    ).flat();

    return results.sort((left, right) => right.score - left.score).slice(0, 8);
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
    return this.withAccessibleDocumentUrl(document, { includeParsed: true });
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
        "(chunk.text LIKE :keyword OR chunk.searchText LIKE :keyword OR CAST(chunk.metadata AS TEXT) LIKE :keyword)",
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
      searchText: "",
      tokenCount: metadata.tokenCount,
      characterCount: metadata.characterCount,
      recallCount: 0,
      enabled: true,
      embeddingModel:
        document.embeddingModel ?? this.documentEmbeddingService.model,
      embeddingDimension: document.embeddingDimension,
      vectorId: randomUUID(),
      metadata,
      createdBy: userId,
      updatedBy: userId,
    });
    chunk.searchText = this.createChunkSearchText(chunk);

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
      chunk.tokenCount = estimateChunkTokens(nextText);
      chunk.characterCount = nextText.length;
      chunk.metadata = {
        ...chunk.metadata,
        tokenCount: chunk.tokenCount,
        characterCount: chunk.characterCount,
      };
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
    chunk.searchText = this.createChunkSearchText(chunk);

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

    await this.clearDocumentIndex(documentId);

    document.parseStatus = KnowledgeDocumentParseStatus.PARSING;
    this.resetParsedArtifacts(document);
    await this.documentRepository.save(document);

    try {
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

      document.enhanceStatus = KnowledgeDocumentEnhanceStatus.ENHANCED;
      document.enhanceError = null;
      document.enhancedDocument = enhancedDocument;
      document.enhancedText = enhancedDocument.text;
      document.characterCount = cleanedDocument.characterCount;
      document.enhancedAt = new Date();
      await this.documentRepository.save(document);

      document.chunkStatus = KnowledgeDocumentChunkStatus.CHUNKING;
      document.chunkError = null;
      await this.documentRepository.save(document);
      const chunks = await this.documentChunkerService.createChunks({
        knowledgeId,
        documentId,
        documentName: document.name,
        contentType: document.contentType,
        document: cleanedDocument,
        chunkConfig,
      });

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
            metadata: chunk.metadata,
            createdBy: userId,
            updatedBy: userId,
          }),
        ),
      );
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

      document.indexStatus = KnowledgeDocumentIndexStatus.INDEXED;
      document.indexError = null;
      document.vectorCollection = this.documentVectorStoreService.collection;
      document.indexedAt = new Date();
    } catch (error) {
      this.applyProcessError(document, error);
    }

    return this.withAccessibleDocumentUrl(
      await this.documentRepository.save(document),
      { includeParsed: true },
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
