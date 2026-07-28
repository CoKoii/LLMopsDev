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
import { ChatAttachment } from "./chat-attachment.entity";
import { ChatSession } from "./chat-session.entity";

export const CHAT_MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;

export const CHAT_MESSAGE_STATUS = {
  COMPLETED: "completed",
  STREAMING: "streaming",
  FAILED: "failed",
  STOPPED: "stopped",
} as const;

export type ChatMessageRole =
  (typeof CHAT_MESSAGE_ROLE)[keyof typeof CHAT_MESSAGE_ROLE];
export type ChatMessageStatus =
  (typeof CHAT_MESSAGE_STATUS)[keyof typeof CHAT_MESSAGE_STATUS];

@Entity({ name: "ai_chat_messages", comment: "AI对话消息" })
@Index(["sessionId", "createdAt"])
@Index(["sessionId", "role", "createdAt"])
export class ChatMessage extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "消息ID" })
  id!: number;

  @Column({ comment: "会话ID", type: "int" })
  sessionId!: number;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<ChatSession>;

  @Column({ comment: "消息角色", type: "varchar", length: 20 })
  role!: ChatMessageRole;

  @Column({ comment: "消息内容", type: "text" })
  content!: string;

  @Column({
    comment: "消息状态",
    type: "varchar",
    length: 20,
    default: CHAT_MESSAGE_STATUS.COMPLETED,
  })
  status!: ChatMessageStatus;

  @Column({ comment: "耗时毫秒", type: "int", nullable: true })
  elapsedMs?: number | null;

  @Column({ comment: "Token数", type: "int", nullable: true })
  tokens?: number | null;

  @Column({ comment: "消息元数据", type: "jsonb", nullable: true })
  metadata?: Record<string, unknown> | null;

  @OneToMany(() => ChatAttachment, (attachment) => attachment.message)
  attachments!: Relation<ChatAttachment[]>;
}
