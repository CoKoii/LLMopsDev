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
import { User } from "../../../iam/users/user.entity";
import { AiApp } from "../../app/entities/app.entity";

@Entity({ name: "ai_chat_user_memories", comment: "AI应用用户长期记忆" })
@Index(["appId", "userId"], { unique: true })
export class ChatUserMemory extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "长期记忆ID" })
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

  @Column({ comment: "长期记忆内容", type: "text", nullable: true })
  content?: string | null;

  @Column({ comment: "最后生成来源会话ID", type: "int", nullable: true })
  sourceSessionId?: number | null;

  @Column({ comment: "最后生成时间", type: "timestamp", nullable: true })
  generatedAt?: Date | null;
}
