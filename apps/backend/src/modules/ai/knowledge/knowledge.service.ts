import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { Repository } from "typeorm";
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
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentEnhancerService } from "./document-enhancer/document-enhancer.service";
import { DocumentParserService } from "./document-parser/document-parser.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { QueryKnowledgeDocumentsDto } from "./dto/query-knowledge-documents.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
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

@Injectable()
export class KnowledgeService {
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

  private isDocumentProcessing(document: KnowledgeDocument) {
    return (
      document.parseStatus === KnowledgeDocumentParseStatus.PARSING ||
      document.cleanStatus === KnowledgeDocumentCleanStatus.CLEANING ||
      document.enhanceStatus === KnowledgeDocumentEnhanceStatus.ENHANCING ||
      document.chunkStatus === KnowledgeDocumentChunkStatus.CHUNKING ||
      document.embeddingStatus === KnowledgeDocumentEmbeddingStatus.QUEUED ||
      document.embeddingStatus === KnowledgeDocumentEmbeddingStatus.EMBEDDING ||
      document.indexStatus === KnowledgeDocumentIndexStatus.INDEXING
    );
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
        parseStatus: KnowledgeDocumentParseStatus.UPLOADED,
        cleanStatus: KnowledgeDocumentCleanStatus.PENDING,
        enhanceStatus: KnowledgeDocumentEnhanceStatus.PENDING,
        chunkStatus: KnowledgeDocumentChunkStatus.PENDING,
        embeddingStatus: KnowledgeDocumentEmbeddingStatus.PENDING,
        indexStatus: KnowledgeDocumentIndexStatus.PENDING,
      }),
    );

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
  // 提交知识库文档处理任务
  async processDocument(
    knowledgeId: number,
    documentId: number,
    userId: number,
  ) {
    const document = await this.findOwnedDocument(
      knowledgeId,
      documentId,
      userId,
    );

    if (this.isDocumentProcessing(document)) {
      return this.withAccessibleDocumentUrl(document);
    }

    document.parseStatus = KnowledgeDocumentParseStatus.PARSING;
    this.resetParsedArtifacts(document);
    const savedDocument = await this.documentRepository.save(document);

    try {
      await this.documentProcessQueueService.enqueue({
        knowledgeId,
        documentId,
        userId,
      });
    } catch (error) {
      this.applyProcessError(savedDocument, error);
      await this.documentRepository.save(savedDocument);
      throw error;
    }

    return this.withAccessibleDocumentUrl(savedDocument);
  }
  // --------------------------------------------------------------------------------------------------

  // --------------------------------------------------------------------------------------------------
  // 执行知识库文档处理任务
  async executeDocumentProcess(
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
      const { document: cleanedDocument } =
        this.documentCleanerService.clean(parsedDocument);

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
        summary: enhancedDocument.metadata.summary,
        keywords: enhancedDocument.metadata.keywords,
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
