import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { FileEntity } from "../../../files/file.entity";
import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import type { EnhancedDocument } from "../document-enhancer/document-enhancer.types";
import type { ParsedDocument } from "../document-parser/document-parser.types";
import { Knowledge } from "./knowledge.entity";

export enum KnowledgeDocumentParseStatus {
  UPLOADED = "uploaded",
  PARSING = "parsing",
  PARSED = "parsed",
  FAILED = "failed",
}

export enum KnowledgeDocumentCleanStatus {
  PENDING = "pending",
  CLEANING = "cleaning",
  CLEANED = "cleaned",
  FAILED = "failed",
}

export enum KnowledgeDocumentEnhanceStatus {
  PENDING = "pending",
  ENHANCING = "enhancing",
  ENHANCED = "enhanced",
  FAILED = "failed",
}

export enum KnowledgeDocumentChunkStatus {
  PENDING = "pending",
  CHUNKING = "chunking",
  CHUNKED = "chunked",
  FAILED = "failed",
}

export enum KnowledgeDocumentEmbeddingStatus {
  PENDING = "pending",
  QUEUED = "queued",
  EMBEDDING = "embedding",
  EMBEDDED = "embedded",
  FAILED = "failed",
}

export enum KnowledgeDocumentIndexStatus {
  PENDING = "pending",
  INDEXING = "indexing",
  INDEXED = "indexed",
  FAILED = "failed",
}

@Entity({ name: "ai_knowledge_documents", comment: "知识库文档" })
@Index(["knowledgeId", "fileId"], { unique: true })
@Index(["knowledgeId", "enabled"])
export class KnowledgeDocument extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "知识库ID", type: "int" })
  knowledgeId!: number;

  @ManyToOne(() => Knowledge, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "knowledgeId" })
  knowledge!: Relation<Knowledge>;

  @Column({ comment: "文件ID", type: "int", nullable: true })
  fileId?: number | null;

  @ManyToOne(() => FileEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "fileId" })
  file?: Relation<FileEntity> | null;

  @Column({ comment: "文档名称", length: 255 })
  name!: string;

  @Column({ comment: "文件类型", length: 100 })
  contentType!: string;

  @Column({ comment: "文件大小", type: "int" })
  size!: number;

  @Column({ comment: "OSS对象Key", length: 512 })
  objectKey!: string;

  @Column({ comment: "访问地址", length: 1024 })
  url!: string;

  @Column({ comment: "字符数", type: "int", default: 0 })
  characterCount!: number;

  @Column({ comment: "召回次数", type: "int", default: 0 })
  recallCount!: number;

  @Column({ comment: "是否启用", default: true })
  enabled!: boolean;

  @Column({
    comment: "解析状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentParseStatus.UPLOADED,
  })
  parseStatus!: KnowledgeDocumentParseStatus;

  @Column({ comment: "解析错误", type: "text", nullable: true })
  parseError?: string | null;

  @Column({ comment: "解析纯文本", type: "text", nullable: true })
  parsedText?: string | null;

  @Column({ comment: "结构化解析结果", type: "json", nullable: true })
  parsedDocument?: ParsedDocument | null;

  @Column({ comment: "解析完成时间", type: "timestamp", nullable: true })
  parsedAt?: Date | null;

  @Column({
    comment: "清洗状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentCleanStatus.PENDING,
  })
  cleanStatus!: KnowledgeDocumentCleanStatus;

  @Column({ comment: "清洗错误", type: "text", nullable: true })
  cleanError?: string | null;

  @Column({ comment: "清洗后纯文本", type: "text", nullable: true })
  cleanedText?: string | null;

  @Column({ comment: "结构化清洗结果", type: "json", nullable: true })
  cleanedDocument?: CleanedDocument | null;

  @Column({ comment: "清洗完成时间", type: "timestamp", nullable: true })
  cleanedAt?: Date | null;

  @Column({
    comment: "增强状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentEnhanceStatus.PENDING,
  })
  enhanceStatus!: KnowledgeDocumentEnhanceStatus;

  @Column({ comment: "增强错误", type: "text", nullable: true })
  enhanceError?: string | null;

  @Column({ comment: "增强后纯文本", type: "text", nullable: true })
  enhancedText?: string | null;

  @Column({ comment: "结构化增强结果", type: "json", nullable: true })
  enhancedDocument?: EnhancedDocument | null;

  @Column({ comment: "增强完成时间", type: "timestamp", nullable: true })
  enhancedAt?: Date | null;

  @Column({
    comment: "切块状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentChunkStatus.PENDING,
  })
  chunkStatus!: KnowledgeDocumentChunkStatus;

  @Column({ comment: "切块错误", type: "text", nullable: true })
  chunkError?: string | null;

  @Column({ comment: "切块数量", type: "int", default: 0 })
  chunkCount!: number;

  @Column({ comment: "切块完成时间", type: "timestamp", nullable: true })
  chunkedAt?: Date | null;

  @Column({
    comment: "向量化状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentEmbeddingStatus.PENDING,
  })
  embeddingStatus!: KnowledgeDocumentEmbeddingStatus;

  @Column({ comment: "向量化错误", type: "text", nullable: true })
  embeddingError?: string | null;

  @Column({
    comment: "Embedding模型",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  embeddingModel?: string | null;

  @Column({ comment: "向量维度", type: "int", default: 0 })
  embeddingDimension!: number;

  @Column({ comment: "向量化完成时间", type: "timestamp", nullable: true })
  embeddedAt?: Date | null;

  @Column({
    comment: "向量索引状态",
    type: "varchar",
    length: 20,
    default: KnowledgeDocumentIndexStatus.PENDING,
  })
  indexStatus!: KnowledgeDocumentIndexStatus;

  @Column({ comment: "向量索引错误", type: "text", nullable: true })
  indexError?: string | null;

  @Column({
    comment: "向量集合名",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  vectorCollection?: string | null;

  @Column({ comment: "索引完成时间", type: "timestamp", nullable: true })
  indexedAt?: Date | null;
}
