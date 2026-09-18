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
import { AiApp } from "../../app/entities/app.entity";
import { ChatSession } from "./chat-session.entity";

@Entity({ name: "ai_chat_session_summaries", comment: "AI会话中期记忆" })
@Index(["sessionId"], { unique: true })
@Index(["appId", "userId"])
export class ChatSessionSummary extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "摘要ID" })
  id!: number;

  @Column({ comment: "AI应用ID", type: "int" })
  appId!: number;

  @ManyToOne(() => AiApp, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "appId" })
  app!: Relation<AiApp>;

  @Column({ comment: "用户ID", type: "int" })
  userId!: number;

  @Column({ comment: "会话ID", type: "int" })
  sessionId!: number;

  @ManyToOne(() => ChatSession, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<ChatSession>;

  @Column({ comment: "摘要覆盖到的消息ID", type: "int", default: 0 })
  coveredMessageId!: number;

  @Column({ comment: "摘要覆盖消息数", type: "int", default: 0 })
  coveredMessageCount!: number;

  @Column({ comment: "会话摘要", type: "text", nullable: true })
  content?: string | null;

  @Column({ comment: "最后刷新时间", type: "timestamp", nullable: true })
  refreshedAt?: Date | null;
}
