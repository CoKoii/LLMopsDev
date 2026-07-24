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
import { Knowledge } from "./knowledge.entity";

@Entity({ name: "ai_knowledge_documents", comment: "知识库文档" })
@Index(["knowledgeId", "fileId"], { unique: true })
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
}
