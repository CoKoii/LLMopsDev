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
import { User } from "../../../iam/users/user.entity";
import { AiApp } from "../../app/entities/app.entity";
import { ChatMessage } from "./chat-message.entity";

export type ChatSessionMode = "debug" | "standalone" | "openapi";

@Entity({ name: "ai_chat_sessions", comment: "AI对话会话" })
@Index(["appId", "userId", "updatedAt"])
@Index(["publicId"], { unique: true })
@Index(["appId", "userId", "externalUserId", "updatedAt"])
export class ChatSession extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "会话ID" })
  id!: number;

  @Column({ comment: "AI应用ID", type: "int" })
  appId!: number;

  @ManyToOne(() => AiApp, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "appId" })
  app!: Relation<AiApp>;

  @Column({ comment: "用户ID", type: "int" })
  userId!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({
    comment: "公开会话ID",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  publicId?: string | null;

  @Column({
    comment: "开放API终端用户ID",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  externalUserId?: string | null;

  @Column({
    comment: "会话类型",
    type: "varchar",
    length: 20,
    default: "debug",
  })
  mode!: ChatSessionMode;

  @Column({ comment: "标题", type: "varchar", length: 120, nullable: true })
  title?: string | null;

  @Column({ comment: "最后消息时间", type: "timestamp", nullable: true })
  lastMessageAt?: Date | null;

  @Column({ comment: "置顶时间", type: "timestamp", nullable: true })
  pinnedAt?: Date | null;

  @OneToMany(() => ChatMessage, (message) => message.session)
  messages!: Relation<ChatMessage[]>;
}
