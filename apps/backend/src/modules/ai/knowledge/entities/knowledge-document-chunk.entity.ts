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
import type { DocumentChunkMetadata } from "../document-chunker/document-chunker.types";
import { KnowledgeDocument } from "./knowledge-document.entity";
import { Knowledge } from "./knowledge.entity";

@Entity({ name: "ai_knowledge_document_chunks", comment: "知识库文档切块" })
@Index(["knowledgeId", "documentId", "chunkIndex"], { unique: true })
@Index(["vectorId"])
export class KnowledgeDocumentChunk extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "知识库ID", type: "int" })
  knowledgeId!: number;

  @ManyToOne(() => Knowledge, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "knowledgeId" })
  knowledge!: Relation<Knowledge>;

  @Column({ comment: "文档ID", type: "int" })
  documentId!: number;

  @ManyToOne(() => KnowledgeDocument, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "documentId" })
  document!: Relation<KnowledgeDocument>;

  @Column({ comment: "切块序号", type: "int" })
  chunkIndex!: number;

  @Column({ comment: "切块文本", type: "text" })
  text!: string;

  @Column({ comment: "全文检索文本", type: "text" })
  searchText!: string;

  @Column({ comment: "估算Token数", type: "int" })
  tokenCount!: number;

  @Column({ comment: "字符数", type: "int" })
  characterCount!: number;

  @Column({ comment: "召回次数", type: "int", default: 0 })
  recallCount!: number;

  @Column({ comment: "是否启用", default: true })
  enabled!: boolean;

  @Column({ comment: "Embedding模型", length: 100 })
  embeddingModel!: string;

  @Column({ comment: "向量维度", type: "int" })
  embeddingDimension!: number;

  @Column({ comment: "向量ID", length: 64 })
  vectorId!: string;

  @Column({ comment: "切块Metadata", type: "json" })
  metadata!: DocumentChunkMetadata;
}
