import { AIMessage } from "@langchain/core/messages";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "node:crypto";
import { Repository } from "typeorm";
import { FilesService } from "../../files/files.service";
import { DocumentChunkerService } from "../knowledge/document-chunker/document-chunker.service";
import { DocumentCleanerService } from "../knowledge/document-cleaner/document-cleaner.service";
import { DocumentEmbeddingService } from "../knowledge/document-embedding/document-embedding.service";
import { DocumentParserService } from "../knowledge/document-parser/document-parser.service";
import type { ParsedDocument } from "../knowledge/document-parser/document-parser.types";
import { DocumentVectorStoreService } from "../knowledge/document-vector-store/document-vector-store.service";
import type { AiAppVersionConfig } from "../app/entities/app-version.entity";
import { AiRuntimeService } from "./ai-runtime.service";
import {
  CHAT_ATTACHMENT_KIND,
  CHAT_ATTACHMENT_STATUS,
  ChatAttachment,
  type ChatAttachmentKind,
} from "./entities/chat-attachment.entity";
import { ChatAttachmentChunk } from "./entities/chat-attachment-chunk.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { ChatSession } from "./entities/chat-session.entity";

const MULTIMODAL_EXTRACTION_PROMPT = [
  "将附件内容转换为后续对话和检索可使用的中文文本。",
  "保留可见事实、文字、结构、关键数值和空间关系。",
  "只描述附件中能确认的信息；不要推断意图，不要编造。",
].join("\n");
const ATTACHMENT_RECALL_LIMIT = 8;
const ATTACHMENT_CONTEXT_MAX_CHARS = 9000;
const ATTACHMENT_CHUNK_MAX_CHARS = 900;
const CURRENT_ATTACHMENT_CONTEXT_MAX_CHARS = 12000;
const CURRENT_ATTACHMENT_CHUNK_MAX_CHARS = 1200;

type AttachmentRecallItem = {
  id: number;
  attachmentId: number;
  messageId: number;
  fileId: number;
  fileName: string;
  displayLabel?: string;
  duplicateOfLabel?: string | null;
  chunkIndex: number;
  score: number;
  text: string;
};
type AttachmentContext = {
  context: string;
  items: AttachmentRecallItem[];
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

const getMessageContentText = (message: AIMessage) => {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return item.text;
      }
      return "";
    })
    .join("\n")
    .trim();
};

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
    private readonly aiRuntimeService: AiRuntimeService,
  ) {}

  async processMessageAttachments(params: {
    session: ChatSession;
    message: ChatMessage;
    fileIds: number[];
    userId: number;
    config: AiAppVersionConfig;
  }): Promise<AttachmentContext> {
    const uniqueFileIds = [...new Set(params.fileIds)].filter(Number.isFinite);
    const contexts: string[] = [];
    const items: AttachmentRecallItem[] = [];
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
    }

    return {
      context: this.wrapCurrentAttachmentContext(
        uniqueFileIds.length,
        params.message.content,
        contexts.filter(Boolean),
      ),
      items: items.map((item, index) => ({ ...item, id: index + 1 })),
    };
  }

  async createRecallContext(
    sessionId: number,
    query: string,
    options: { excludeMessageId?: number } = {},
  ): Promise<AttachmentContext> {
    const queryText = query.trim();
    if (!queryText) return { context: "", items: [] as AttachmentRecallItem[] };

    const embeddingResult = await this.documentEmbeddingService.embed([
      queryText,
    ]);
    const vector = embeddingResult.vectors[0] ?? [];
    const points =
      await this.documentVectorStoreService.searchSessionAttachments({
        vector,
        sessionId,
        limit: ATTACHMENT_RECALL_LIMIT,
        excludeMessageId: options.excludeMessageId,
      });

    const items = points.map((point, index) => ({
      id: index + 1,
      attachmentId: point.payload.attachmentId,
      messageId: point.payload.messageId,
      fileId: point.payload.fileId,
      fileName: point.payload.fileName,
      displayLabel: point.payload.displayLabel,
      duplicateOfLabel: point.payload.duplicateOfLabel,
      chunkIndex: point.payload.chunkIndex,
      score: point.score,
      text: compactText(point.payload.text, 180),
    }));

    if (items.length) {
      await Promise.all(
        points.map((point) =>
          this.chunkRepository.increment(
            { id: point.payload.chunkId },
            "recallCount",
            1,
          ),
        ),
      );
    }

    let totalChars = 0;
    const contextParts: string[] = [];
    for (const [index, point] of points.entries()) {
      const text = compactText(point.payload.text, ATTACHMENT_CHUNK_MAX_CHARS);
      if (!text || totalChars + text.length > ATTACHMENT_CONTEXT_MAX_CHARS) {
        break;
      }
      contextParts.push(
        [
          `历史附件资料 ${index + 1}：${point.payload.displayLabel ?? point.payload.fileName}`,
          `文件名：${point.payload.fileName}`,
          point.payload.duplicateOfLabel
            ? `重复关系：该附件与${point.payload.duplicateOfLabel}的文件内容完全相同。`
            : "",
          `片段 #${point.payload.chunkIndex + 1}`,
          `匹配度：${point.score}`,
          `内容：${text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      totalChars += text.length;
    }

    return { context: contextParts.join("\n\n"), items };
  }

  private async processOneAttachment(params: {
    session: ChatSession;
    message: ChatMessage;
    fileId: number;
    userId: number;
    config: AiAppVersionConfig;
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
        (kind === CHAT_ATTACHMENT_KIND.IMAGE
          ? await this.extractMultimodalDocument({
              filename: file.originalName,
              contentType: file.contentType,
              buffer,
              config: params.config,
            })
          : await this.documentParserService.parse({
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

    return {
      sourceAttachmentId: source.id,
      document: {
        title: params.filename,
        format: params.kind,
        contentType: params.contentType,
        text,
        characterCount: text.length,
        blocks: [
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
          blockCount: 1,
        },
      },
    };
  }

  private async extractMultimodalDocument(params: {
    filename: string;
    contentType: string;
    buffer: Buffer;
    config: AiAppVersionConfig;
  }): Promise<ParsedDocument> {
    const model = await this.aiRuntimeService.createMultimodalExtractionModel(
      params.config,
    );
    const imageUrl = `data:${params.contentType};base64,${params.buffer.toString("base64")}`;
    const response = await model.invoke([
      ["system", MULTIMODAL_EXTRACTION_PROMPT],
      [
        "human",
        [
          { type: "text", text: "请提取这个附件中的有效信息。" },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      ],
    ]);
    const text = getMessageContentText(response);

    return {
      title: params.filename,
      format: "image",
      contentType: params.contentType,
      text,
      characterCount: text.length,
      blocks: [
        {
          id: randomUUID(),
          type: "paragraph",
          text,
          metadata: { parser: "gemini-2.5-flash-lite" },
        },
      ],
      metadata: {
        parser: "gemini-2.5-flash-lite",
        blockCount: 1,
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
  }) {
    const cleaned = this.documentCleanerService.clean(params.document).document;
    const chunks = this.documentChunkerService.createChunks({
      knowledgeId: 0,
      documentId: params.attachment.id,
      documentName: params.attachment.fileName,
      contentType: params.attachment.contentType,
      document: cleaned,
    });
    const embeddingResult = await this.documentEmbeddingService.embed(
      chunks.map((chunk) => chunk.embeddingText),
    );
    await this.documentVectorStoreService.ensureCollection(
      embeddingResult.dimension,
    );
    const savedChunks = await this.chunkRepository.save(
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
          embeddingModel: embeddingResult.model,
          embeddingDimension: embeddingResult.dimension,
          vectorId: randomUUID(),
          metadata: {
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
          },
          createdBy: params.userId,
          updatedBy: params.userId,
        }),
      ),
    );
    const duplicateOfAttachmentId =
      params.attachment.duplicateOfAttachmentId ?? undefined;
    await this.documentVectorStoreService.upsert(
      savedChunks.map((chunk, index) => ({
        id: chunk.vectorId,
        vector: embeddingResult.vectors[index] ?? [],
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

    const attachmentMetadata = compactMetadata({
      parser: params.document.metadata.parser,
      blockCount: params.document.metadata.blockCount,
      chunkCount: savedChunks.length,
      format: params.document.format,
      embeddingModel: embeddingResult.model,
      embeddingDimension: embeddingResult.dimension,
      displayLabel: params.attachment.displayLabel,
      displayOrder: params.attachment.displayOrder,
      kindOrder: params.attachment.kindOrder,
      contentHash: params.attachment.contentHash,
      duplicateOfAttachmentId,
      duplicateOfLabel: params.duplicateOfLabel,
      reusedFromAttachmentId: params.reusedFromAttachmentId,
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
