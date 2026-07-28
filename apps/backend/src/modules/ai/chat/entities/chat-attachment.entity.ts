import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { FileEntity } from "../../../files/file.entity";
import { ChatAttachmentChunk } from "./chat-attachment-chunk.entity";
import { ChatMessage } from "./chat-message.entity";
import { ChatSession } from "./chat-session.entity";

export const CHAT_ATTACHMENT_KIND = {
  DOCUMENT: "document",
  IMAGE: "image",
} as const;

export const CHAT_ATTACHMENT_STATUS = {
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
} as const;

export type ChatAttachmentKind =
  (typeof CHAT_ATTACHMENT_KIND)[keyof typeof CHAT_ATTACHMENT_KIND];
export type ChatAttachmentStatus =
  (typeof CHAT_ATTACHMENT_STATUS)[keyof typeof CHAT_ATTACHMENT_STATUS];

@Entity({ name: "ai_chat_attachments", comment: "AI对话附件" })
@Index(["sessionId", "status"])
@Index(["messageId", "displayOrder"])
@Index(["messageId"])
@Index(["fileId"])
@Index(["createdBy", "contentHash", "status"])
export class ChatAttachment extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "附件ID" })
  id!: number;

  @Column({ comment: "会话ID", type: "int" })
  sessionId!: number;

  @ManyToOne(() => ChatSession, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<ChatSession>;

  @Column({ comment: "消息ID", type: "int" })
  messageId!: number;

  @ManyToOne(() => ChatMessage, (message) => message.attachments, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "messageId" })
  message!: Relation<ChatMessage>;

  @Column({ comment: "文件ID", type: "int" })
  fileId!: number;

  @ManyToOne(() => FileEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "fileId" })
  file!: Relation<FileEntity>;

  @Column({ comment: "附件类型", type: "varchar", length: 20 })
  kind!: ChatAttachmentKind;

  @Column({
    comment: "处理状态",
    type: "varchar",
    length: 20,
    default: CHAT_ATTACHMENT_STATUS.PROCESSING,
  })
  status!: ChatAttachmentStatus;

  @Column({ comment: "文件名", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ comment: "文件类型", type: "varchar", length: 100 })
  contentType!: string;

  @Column({ comment: "文件大小", type: "int" })
  size!: number;

  @Column({ comment: "本轮附件顺序", type: "int", default: 0 })
  displayOrder!: number;

  @Column({ comment: "同类型附件顺序", type: "int", default: 0 })
  kindOrder!: number;

  @Column({ comment: "展示标签", type: "varchar", length: 80, nullable: true })
  displayLabel?: string | null;

  @Column({ comment: "文件内容SHA256", type: "varchar", length: 64, nullable: true })
  contentHash?: string | null;

  @Column({ comment: "重复来源附件ID", type: "int", nullable: true })
  duplicateOfAttachmentId?: number | null;

  @ManyToOne(() => ChatAttachment, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "duplicateOfAttachmentId" })
  duplicateOfAttachment?: Relation<ChatAttachment> | null;

  @Column({ comment: "抽取文本", type: "text", nullable: true })
  extractedText?: string | null;

  @Column({ comment: "摘要", type: "text", nullable: true })
  summary?: string | null;

  @Column({ comment: "处理错误", type: "text", nullable: true })
  error?: string | null;

  @Column({ comment: "附件元数据", type: "jsonb", nullable: true })
  metadata?: Record<string, unknown> | null;

  @OneToMany(() => ChatAttachmentChunk, (chunk) => chunk.attachment)
  chunks!: Relation<ChatAttachmentChunk[]>;
}
