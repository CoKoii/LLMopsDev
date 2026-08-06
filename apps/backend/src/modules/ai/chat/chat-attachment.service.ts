import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "node:crypto";
import { In, Not, Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import { DocumentChunkerService } from "../knowledge/document-chunker/document-chunker.service";
import { normalizeCjkText } from "../knowledge/cjk-normalize";
import { DocumentCleanerService } from "../knowledge/document-cleaner/document-cleaner.service";
import { DocumentEmbeddingService } from "../knowledge/document-embedding/document-embedding.service";
import { DocumentParserService } from "../knowledge/document-parser/document-parser.service";
import type {
  ParsedDocument,
  ParsedDocumentBlock,
} from "../knowledge/document-parser/document-parser.types";
import { DocumentVectorStoreService } from "../knowledge/document-vector-store/document-vector-store.service";
import {
  CHAT_ATTACHMENT_KIND,
  CHAT_ATTACHMENT_STATUS,
  ChatAttachment,
  type ChatAttachmentKind,
} from "./entities/chat-attachment.entity";
import { ChatAttachmentChunk } from "./entities/chat-attachment-chunk.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { ChatSession } from "./entities/chat-session.entity";

const ATTACHMENT_RECALL_LIMIT = 8;
const ATTACHMENT_RECALL_MIN_SCORE = 0.35;
const ATTACHMENT_TEXT_RECALL_MIN_SCORE = 0.25;
const ATTACHMENT_TEXT_RECALL_MAX_CHUNKS = 200;
const ATTACHMENT_CONTEXT_MAX_CHARS = 9000;
const ATTACHMENT_CHUNK_MAX_CHARS = 900;
const CURRENT_ATTACHMENT_CONTEXT_MAX_CHARS = 12000;
const CURRENT_ATTACHMENT_CHUNK_MAX_CHARS = 1200;

type AttachmentRecallItem = {
  id: number;
  chunkId?: number;
  attachmentId: number;
  messageId: number;
  fileId: number;
  fileName: string;
  displayLabel?: string;
  duplicateOfLabel?: string | null;
  queries?: string[];
  chunkIndex: number;
  score: number;
  text: string;
};
type AttachmentContext = {
  context: string;
  items: AttachmentRecallItem[];
  tokens?: number;
};
type AttachmentDisplayInfo = {
  attachmentIndex: number;
  imageIndex: number;
  documentIndex: number;
  contentByHash: Map<
    string,
    {
      document: ParsedDocument;
      label: string;
      attachmentId: number;
    }
  >;
};
type ReusableAttachmentDocument = {
  document: ParsedDocument;
  sourceAttachmentId?: number;
};

const compactText = (value: string, maxLength: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const normalizeAttachmentText = (value: string) =>
  normalizeCjkText(value).toLowerCase().replace(/\s+/g, " ").trim();

const extractAttachmentTerms = (query: string) => {
  const normalizedQuery = normalizeAttachmentText(query);
  const terms: string[] = [];

  terms.push(
    ...Array.from(
      normalizedQuery.matchAll(/[a-z0-9][a-z0-9_./+@-]{1,}/g),
      (match) => match[0],
    ).filter((term) => /[a-z]/.test(term)),
  );

  for (const match of normalizedQuery.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const segment = match[0];
    for (let index = 0; index <= segment.length - 2; index += 1) {
      terms.push(segment.slice(index, index + 2));
    }
  }

  return [...new Set(terms)];
};

const getAttachmentTextMatchScore = (
  queryTerms: string[],
  searchText: string,
  text: string,
) => {
  if (!queryTerms.length) return 0;
  const haystack = normalizeAttachmentText(`${searchText} ${text}`);
  const matched = queryTerms.filter((term) => haystack.includes(term)).length;
  return Math.max(0, Math.min(1, matched / queryTerms.length));
};

const compactMetadata = (metadata: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );

const getMetadataString = (
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
};

const isImageContentType = (contentType: string) =>
  contentType.toLowerCase().startsWith("image/");

@Injectable()
export class ChatAttachmentService {
  private readonly logger = new Logger(ChatAttachmentService.name);

  constructor(
    @InjectRepository(ChatAttachment)
    private readonly attachmentRepository: Repository<ChatAttachment>,
    @InjectRepository(ChatAttachmentChunk)
    private readonly chunkRepository: Repository<ChatAttachmentChunk>,
    private readonly filesService: FilesService,
    private readonly documentParserService: DocumentParserService,
    private readonly documentCleanerService: DocumentCleanerService,
    private readonly documentChunkerService: DocumentChunkerService,
    private readonly documentEmbeddingService: DocumentEmbeddingService,
    private readonly documentVectorStoreService: DocumentVectorStoreService,
  ) {}

  async processMessageAttachments(params: {
    session: ChatSession;
    message: ChatMessage;
    fileIds: number[];
    userId: number;
  }): Promise<AttachmentContext> {
    const uniqueFileIds = [...new Set(params.fileIds)].filter(Number.isFinite);
    const contexts: string[] = [];
    const items: AttachmentRecallItem[] = [];
    let tokens: number | undefined;
    const displayInfo: AttachmentDisplayInfo = {
      attachmentIndex: 0,
      imageIndex: 0,
      documentIndex: 0,
      contentByHash: new Map(),
    };

    for (const fileId of uniqueFileIds) {
      const context = await this.processOneAttachment({
        ...params,
        fileId,
        displayInfo,
      });
      contexts.push(context.context);
      items.push(...context.items);
      if (context.tokens !== undefined) {
        tokens = (tokens ?? 0) + context.tokens;
      }
    }

    return {
      context: this.wrapCurrentAttachmentContext(
        uniqueFileIds.length,
        params.message.content,
        contexts.filter(Boolean),
      ),
      items: items.map((item, index) => ({ ...item, id: index + 1 })),
      tokens,
    };
  }

  async createRecallContext(
    sessionId: number,
    query: string,
    options: { excludeMessageId?: number } = {},
  ): Promise<AttachmentContext> {
    const queryText = query.trim();
    if (!queryText) {
      return { context: "", items: [] as AttachmentRecallItem[] };
    }

    let items = await this.searchAttachmentVectors(
      sessionId,
      queryText,
      options,
    );
    if (!items.length) {
      items = await this.searchAttachmentText(sessionId, queryText, options);
    }
    if (!items.length) {
      return { context: "", items };
    }

    await Promise.all(
      items
        .filter((item) => item.chunkId !== undefined)
        .map((item) =>
          this.chunkRepository.increment(
            { id: item.chunkId! },
            "recallCount",
            1,
          ),
        ),
    );

    return {
      context: this.buildAttachmentRecallContext(queryText, items),
      items,
    };
  }

  private async searchAttachmentVectors(
    sessionId: number,
    query: string,
    options: { excludeMessageId?: number },
  ): Promise<AttachmentRecallItem[]> {
    let vector: number[] = [];
    try {
      const embeddingResult = await this.documentEmbeddingService.embed([
        query,
      ]);
      vector = embeddingResult.vectors[0] ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`附件向量召回不可用，降级为文本召回: ${message}`);
      return [];
    }
    if (!vector.length) return [];

    let points;
    try {
      points = await this.documentVectorStoreService.searchSessionAttachments({
        vector,
        sessionId,
        limit: ATTACHMENT_RECALL_LIMIT,
        scoreThreshold: ATTACHMENT_RECALL_MIN_SCORE,
        excludeMessageId: options.excludeMessageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`附件向量检索失败，降级为文本召回: ${message}`);
      return [];
    }

    return points.map((point, index) => ({
      id: index + 1,
      chunkId: point.payload.chunkId,
      attachmentId: point.payload.attachmentId,
      messageId: point.payload.messageId,
      fileId: point.payload.fileId,
      fileName: point.payload.fileName,
      displayLabel: point.payload.displayLabel,
      duplicateOfLabel: point.payload.duplicateOfLabel,
      queries: [query],
      chunkIndex: point.payload.chunkIndex,
      score: point.score,
      text: compactText(point.payload.text, 180),
    }));
  }

  private async searchAttachmentText(
    sessionId: number,
    query: string,
    options: { excludeMessageId?: number },
  ): Promise<AttachmentRecallItem[]> {
    const queryTerms = extractAttachmentTerms(query);
    if (!queryTerms.length) return [];

    const chunks = await this.chunkRepository.find({
      where: {
        sessionId,
        enabled: true,
        ...(options.excludeMessageId
          ? { messageId: Not(options.excludeMessageId) }
          : {}),
      },
      order: { id: "DESC" },
      take: ATTACHMENT_TEXT_RECALL_MAX_CHUNKS,
      relations: { attachment: true },
    });
    if (!chunks.length) return [];

    return chunks
      .map((chunk) => ({
        chunk,
        score: getAttachmentTextMatchScore(
          queryTerms,
          chunk.searchText,
          chunk.text,
        ),
      }))
      .filter(({ score }) => score >= ATTACHMENT_TEXT_RECALL_MIN_SCORE)
      .sort((left, right) => right.score - left.score)
      .slice(0, ATTACHMENT_RECALL_LIMIT)
      .map(({ chunk, score }, index) => ({
        id: index + 1,
        chunkId: chunk.id,
        attachmentId: chunk.attachmentId,
        messageId: chunk.messageId,
        fileId: chunk.attachment.fileId,
        fileName: chunk.attachment.fileName,
        displayLabel: chunk.attachment.displayLabel ?? undefined,
        duplicateOfLabel:
          getMetadataString(chunk.metadata, "duplicateOfLabel") ?? undefined,
        queries: [query],
        chunkIndex: chunk.chunkIndex,
        score,
        text: compactText(chunk.text, 180),
      }));
  }

  private buildAttachmentRecallContext(
    query: string,
    items: AttachmentRecallItem[],
  ) {
    let totalChars = 0;
    const contextParts: string[] = [];
    for (const [index, item] of items.entries()) {
      const text = compactText(item.text, ATTACHMENT_CHUNK_MAX_CHARS);
      if (!text || totalChars + text.length > ATTACHMENT_CONTEXT_MAX_CHARS) {
        break;
      }
      contextParts.push(
        [
          `历史附件资料 ${index + 1}：${item.displayLabel ?? item.fileName}`,
          `检索问题：${query}`,
          `文件名：${item.fileName}`,
          item.duplicateOfLabel
            ? `重复关系：该附件与${item.duplicateOfLabel}的文件内容完全相同。`
            : "",
          `片段 #${item.chunkIndex + 1}`,
          `匹配度：${item.score}`,
          `内容：${text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      totalChars += text.length;
    }

    return contextParts.join("\n\n");
  }

  async hasRecallableChunks(
    sessionId: number,
    options: { excludeMessageId?: number } = {},
  ) {
    const count = await this.chunkRepository.count({
      where: {
        sessionId,
        enabled: true,
        ...(options.excludeMessageId
          ? { messageId: Not(options.excludeMessageId) }
          : {}),
      },
    });
    return count > 0;
  }

  async deleteSessionAttachments(sessionId: number) {
    await this.documentVectorStoreService.deleteSessionPoints(sessionId);
    await this.chunkRepository.delete({ sessionId });
  }

  private async processOneAttachment(params: {
    session: ChatSession;
    message: ChatMessage;
    fileId: number;
    userId: number;
    displayInfo: AttachmentDisplayInfo;
  }): Promise<AttachmentContext> {
    const { file, buffer } = await this.filesService.getOwnedObjectBuffer(
      params.fileId,
      params.userId,
    );
    const kind: ChatAttachmentKind = isImageContentType(file.contentType)
      ? CHAT_ATTACHMENT_KIND.IMAGE
      : CHAT_ATTACHMENT_KIND.DOCUMENT;
    const attachmentIndex = ++params.displayInfo.attachmentIndex;
    const kindIndex =
      kind === CHAT_ATTACHMENT_KIND.IMAGE
        ? ++params.displayInfo.imageIndex
        : ++params.displayInfo.documentIndex;
    const attachmentLabel = this.createAttachmentLabel(
      kind,
      attachmentIndex,
      kindIndex,
    );
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const duplicatedContent = params.displayInfo.contentByHash.get(contentHash);
    const attachment = await this.attachmentRepository.save(
      this.attachmentRepository.create({
        sessionId: params.session.id,
        messageId: params.message.id,
        fileId: file.id,
        kind,
        status: CHAT_ATTACHMENT_STATUS.PROCESSING,
        fileName: file.originalName,
        contentType: file.contentType,
        size: file.size,
        displayOrder: attachmentIndex,
        kindOrder: kindIndex,
        displayLabel: attachmentLabel,
        contentHash,
        duplicateOfAttachmentId: duplicatedContent?.attachmentId,
        createdBy: params.userId,
        updatedBy: params.userId,
      }),
    );

    try {
      const reusableDocument = duplicatedContent
        ? undefined
        : await this.findReusableAttachmentDocument({
            kind,
            contentHash,
            userId: params.userId,
            filename: file.originalName,
            contentType: file.contentType,
          });
      const document =
        duplicatedContent?.document ??
        reusableDocument?.document ??
        (await this.documentParserService.parse({
          filename: file.originalName,
          contentType: file.contentType,
          buffer,
        }));
      if (!document.text.trim()) {
        throw new BadRequestException("附件未解析出有效内容");
      }
      if (!duplicatedContent) {
        params.displayInfo.contentByHash.set(contentHash, {
          document,
          label: attachmentLabel,
          attachmentId: attachment.id,
        });
      }
      await this.indexAttachmentDocument({
        attachment,
        session: params.session,
        message: params.message,
        document,
        userId: params.userId,
        duplicateOfLabel: duplicatedContent?.label,
        reusedFromAttachmentId: reusableDocument?.sourceAttachmentId,
      });
      return this.createCurrentAttachmentContext({
        attachment,
        session: params.session,
        message: params.message,
        duplicateOfLabel: duplicatedContent?.label,
        tokens: document.metadata.tokens,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.warn(`对话附件处理失败 fileId=${file.id}: ${message}`, stack);
      await this.attachmentRepository.update(attachment.id, {
        status: CHAT_ATTACHMENT_STATUS.FAILED,
        error: message,
        updatedBy: params.userId,
      });
      throw new BadRequestException(
        `附件 ${file.originalName} 处理失败：${message}`,
      );
    }
  }

  private async findReusableAttachmentDocument(params: {
    kind: ChatAttachmentKind;
    contentHash: string;
    userId: number;
    filename: string;
    contentType: string;
  }): Promise<ReusableAttachmentDocument | undefined> {
    const source = await this.attachmentRepository.findOne({
      where: {
        kind: params.kind,
        contentHash: params.contentHash,
        status: CHAT_ATTACHMENT_STATUS.READY,
        createdBy: params.userId,
      },
      order: { id: "DESC" },
    });
    const text = source?.extractedText?.trim();
    if (!source || !text) return undefined;

    // 复用完整清洗后的分块结构，避免退化为单块文本导致分块质量下降。
    const storedBlocks = Array.isArray(source.metadata?.cleanedBlocks)
      ? (source.metadata.cleanedBlocks as ParsedDocumentBlock[])
      : undefined;

    return {
      sourceAttachmentId: source.id,
      document: {
        title: params.filename,
        format: getMetadataString(source.metadata, "format") ?? params.kind,
        contentType: params.contentType,
        text,
        characterCount: text.length,
        blocks: storedBlocks?.length
          ? storedBlocks
          : [
              {
                id: randomUUID(),
                type: "paragraph",
                text,
                metadata: {
                  parser:
                    getMetadataString(source.metadata, "parser") ??
                    "reused-chat-attachment",
                  reusedFromAttachmentId: source.id,
                },
              },
            ],
        metadata: {
          parser:
            getMetadataString(source.metadata, "parser") ??
            "reused-chat-attachment",
          blockCount: storedBlocks?.length ?? 1,
        },
      },
    };
  }

  private async indexAttachmentDocument(params: {
    attachment: ChatAttachment;
    session: ChatSession;
    message: ChatMessage;
    document: ParsedDocument;
    userId: number;
    duplicateOfLabel?: string;
    reusedFromAttachmentId?: number;
  }): Promise<void> {
    const cleaned = this.documentCleanerService.clean(params.document).document;
    const chunks = this.documentChunkerService.createChunks({
      knowledgeId: 0,
      documentId: params.attachment.id,
      documentName: params.attachment.fileName,
      contentType: params.attachment.contentType,
      document: cleaned,
    });
    const duplicateOfAttachmentId =
      params.attachment.duplicateOfAttachmentId ?? undefined;
    const chunkMetadata = (chunk: (typeof chunks)[number]) => ({
      ...chunk.metadata,
      sessionId: params.session.id,
      messageId: params.message.id,
      attachmentId: params.attachment.id,
      fileId: params.attachment.fileId,
      displayOrder: params.attachment.displayOrder,
      kindOrder: params.attachment.kindOrder,
      displayLabel: params.attachment.displayLabel,
      contentHash: params.attachment.contentHash,
      duplicateOfAttachmentId: params.attachment.duplicateOfAttachmentId,
      duplicateOfLabel: params.duplicateOfLabel,
    });

    let embeddingResult:
      | Awaited<ReturnType<DocumentEmbeddingService["embed"]>>
      | undefined;
    let savedChunks: ChatAttachmentChunk[] | undefined;
    let vectorUpserted = false;
    let indexingError: string | undefined;

    try {
      embeddingResult = await this.documentEmbeddingService.embed(
        chunks.map((chunk) => chunk.embeddingText),
      );
      if (!embeddingResult.dimension) {
        throw new Error("embedding 返回空维度");
      }
      await this.documentVectorStoreService.ensureCollection(
        embeddingResult.dimension,
      );
      savedChunks = await this.chunkRepository.save(
        chunks.map((chunk) =>
          this.chunkRepository.create({
            sessionId: params.session.id,
            messageId: params.message.id,
            attachmentId: params.attachment.id,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            searchText: chunk.searchText,
            tokenCount: chunk.tokenCount,
            characterCount: chunk.characterCount,
            recallCount: 0,
            enabled: true,
            embeddingModel: embeddingResult!.model,
            embeddingDimension: embeddingResult!.dimension,
            vectorId: randomUUID(),
            metadata: chunkMetadata(chunk),
            createdBy: params.userId,
            updatedBy: params.userId,
          }),
        ),
      );
      try {
        await this.documentVectorStoreService.upsert(
          savedChunks.map((chunk, index) => ({
            id: chunk.vectorId,
            vector: embeddingResult!.vectors[index] ?? [],
            payload: {
              source: "chat_attachment",
              sessionId: chunk.sessionId,
              messageId: chunk.messageId,
              attachmentId: chunk.attachmentId,
              fileId: params.attachment.fileId,
              fileName: params.attachment.fileName,
              kind: params.attachment.kind,
              displayOrder: params.attachment.displayOrder,
              kindOrder: params.attachment.kindOrder,
              displayLabel: params.attachment.displayLabel ?? undefined,
              contentHash: params.attachment.contentHash ?? undefined,
              duplicateOfAttachmentId,
              duplicateOfLabel: params.duplicateOfLabel,
              chunkId: chunk.id,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              searchText: chunk.searchText,
              enabled: chunk.enabled,
              metadata: chunk.metadata,
            },
          })),
        );
        vectorUpserted = true;
      } catch (error) {
        await this.chunkRepository.delete({
          id: In(savedChunks.map((chunk) => chunk.id)),
        });
        savedChunks = undefined;
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `附件向量索引失败，降级为纯文本 fileId=${params.attachment.fileId}: ${message}`,
      );
      indexingError = message;
      // 向量链路不可用时仅保存分块文本：本轮上下文仍可引用，历史召回走文本降级。
      savedChunks = await this.chunkRepository.save(
        chunks.map((chunk) =>
          this.chunkRepository.create({
            sessionId: params.session.id,
            messageId: params.message.id,
            attachmentId: params.attachment.id,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            searchText: chunk.searchText,
            tokenCount: chunk.tokenCount,
            characterCount: chunk.characterCount,
            recallCount: 0,
            enabled: true,
            embeddingModel: "",
            embeddingDimension: 0,
            vectorId: "",
            metadata: chunkMetadata(chunk),
            createdBy: params.userId,
            updatedBy: params.userId,
          }),
        ),
      );
    }

    const attachmentMetadata = compactMetadata({
      parser: params.document.metadata.parser,
      blockCount: params.document.metadata.blockCount,
      chunkCount: savedChunks?.length ?? 0,
      format: params.document.format,
      cleanedBlocks: cleaned.blocks,
      ...(embeddingResult
        ? {
            embeddingModel: embeddingResult.model,
            embeddingDimension: embeddingResult.dimension,
          }
        : {}),
      indexed: vectorUpserted,
      indexingError,
      displayLabel: params.attachment.displayLabel,
      displayOrder: params.attachment.displayOrder,
      kindOrder: params.attachment.kindOrder,
      contentHash: params.attachment.contentHash,
      duplicateOfAttachmentId,
      duplicateOfLabel: params.duplicateOfLabel,
      reusedFromAttachmentId: params.reusedFromAttachmentId,
      tokens: params.document.metadata.tokens,
    });

    await this.attachmentRepository.save({
      id: params.attachment.id,
      status: CHAT_ATTACHMENT_STATUS.READY,
      extractedText: params.document.text,
      summary: compactText(params.document.text, 500),
      metadata: attachmentMetadata,
      updatedBy: params.userId,
    });
  }

  private async createCurrentAttachmentContext(params: {
    attachment: ChatAttachment;
    session: ChatSession;
    message: ChatMessage;
    duplicateOfLabel?: string;
    tokens?: number;
  }): Promise<AttachmentContext> {
    const chunks = await this.chunkRepository.find({
      where: {
        sessionId: params.session.id,
        messageId: params.message.id,
        attachmentId: params.attachment.id,
        enabled: true,
      },
      order: { chunkIndex: "ASC" },
    });
    let totalChars = 0;
    const contextParts: string[] = [];
    const items: AttachmentRecallItem[] = [];

    for (const chunk of chunks) {
      const text = compactText(chunk.text, CURRENT_ATTACHMENT_CHUNK_MAX_CHARS);
      if (
        !text ||
        totalChars + text.length > CURRENT_ATTACHMENT_CONTEXT_MAX_CHARS
      ) {
        break;
      }

      const itemId = items.length + 1;
      items.push({
        id: itemId,
        attachmentId: params.attachment.id,
        messageId: params.message.id,
        fileId: params.attachment.fileId,
        fileName: params.attachment.fileName,
        displayLabel: params.attachment.displayLabel ?? undefined,
        duplicateOfLabel: params.duplicateOfLabel,
        chunkIndex: chunk.chunkIndex,
        score: 1,
        text: compactText(chunk.text, 180),
      });
      contextParts.push(
        [
          `${params.attachment.displayLabel ?? params.attachment.fileName} / 片段 #${chunk.chunkIndex + 1}`,
          `文件名：${params.attachment.fileName}`,
          `文件类型：${params.attachment.contentType}`,
          params.duplicateOfLabel
            ? `重复关系：该附件与${params.duplicateOfLabel}的文件内容完全相同，视觉/文本内容应视为一致。`
            : "",
          `内容：${text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      totalChars += text.length;
    }

    return {
      context: contextParts.join("\n\n"),
      items,
      tokens: params.tokens,
    };
  }

  private createAttachmentLabel(
    kind: ChatAttachmentKind,
    attachmentIndex: number,
    kindIndex: number,
  ) {
    const kindLabel =
      kind === CHAT_ATTACHMENT_KIND.IMAGE
        ? `图片${kindIndex}`
        : `文档${kindIndex}`;

    return `本轮附件${attachmentIndex}（${kindLabel}）`;
  }

  private wrapCurrentAttachmentContext(
    count: number,
    userQuestion: string,
    contexts: string[],
  ) {
    if (!contexts.length) return "";

    return [
      `用户原始问题：${userQuestion}`,
      `用户本轮上传了 ${count} 个附件。以下编号按用户本轮上传顺序排列，不要改变编号含义。`,
      "用户问题中的“这张图/图片/附件”默认指本轮附件；“第一张/第二张/两个图片”按下面的图片编号对应。",
      "如果附件被标记为文件内容完全相同，回答区别/对比类问题时必须说明没有内容差异，不要根据文件名、上传顺序或解析措辞制造差异。",
      contexts.join("\n\n"),
    ].join("\n");
  }
}
