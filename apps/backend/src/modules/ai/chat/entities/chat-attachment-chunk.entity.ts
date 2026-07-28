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
import { ChatAttachment } from "./chat-attachment.entity";
import { ChatMessage } from "./chat-message.entity";
import { ChatSession } from "./chat-session.entity";

@Entity({ name: "ai_chat_attachment_chunks", comment: "AI对话附件切块" })
@Index(["sessionId", "enabled"])
@Index(["attachmentId", "chunkIndex"], { unique: true })
@Index(["messageId"])
@Index(["vectorId"])
export class ChatAttachmentChunk extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "切块ID" })
  id!: number;

  @Column({ comment: "会话ID", type: "int" })
  sessionId!: number;

  @ManyToOne(() => ChatSession, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<ChatSession>;

  @Column({ comment: "消息ID", type: "int" })
  messageId!: number;

  @ManyToOne(() => ChatMessage, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "messageId" })
  message!: Relation<ChatMessage>;

  @Column({ comment: "附件ID", type: "int" })
  attachmentId!: number;

  @ManyToOne(() => ChatAttachment, (attachment) => attachment.chunks, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "attachmentId" })
  attachment!: Relation<ChatAttachment>;

  @Column({ comment: "切块序号", type: "int" })
  chunkIndex!: number;

  @Column({ comment: "切块文本", type: "text" })
  text!: string;

  @Column({ comment: "检索文本", type: "text" })
  searchText!: string;

  @Column({ comment: "估算Token数", type: "int" })
  tokenCount!: number;

  @Column({ comment: "字符数", type: "int" })
  characterCount!: number;

  @Column({ comment: "召回次数", type: "int", default: 0 })
  recallCount!: number;

  @Column({ comment: "是否启用", default: true })
  enabled!: boolean;

  @Column({ comment: "Embedding模型", type: "varchar", length: 100 })
  embeddingModel!: string;

  @Column({ comment: "向量维度", type: "int" })
  embeddingDimension!: number;

  @Column({ comment: "向量ID", type: "varchar", length: 80 })
  vectorId!: string;

  @Column({ comment: "切块元数据", type: "jsonb", nullable: true })
  metadata?: Record<string, unknown> | null;
}
