import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from "typeorm";
import { User } from "../users/user.entity";

@Index("idx_auth_sessions_user_id", ["userId"])
@Index("idx_auth_sessions_expires_at", ["expiresAt"])
@Entity({ name: "auth_sessions", comment: "认证会话" })
export class AuthSession {
  @PrimaryColumn({ length: 36, comment: "会话ID" })
  id!: string;

  @Column({ comment: "用户ID" })
  userId!: number;

  @Column({
    length: 255,
    comment: "刷新令牌哈希",
    select: false,
  })
  refreshTokenHash!: string;

  @Column({ comment: "过期时间" })
  expiresAt!: Date;

  @Column({ comment: "最近使用时间" })
  lastUsedAt!: Date;

  @Column({ length: 45, nullable: true, comment: "最后访问IP" })
  ip!: string;

  @Column({ length: 512, nullable: true, comment: "设备标识" })
  userAgent!: string;

  @CreateDateColumn({ comment: "创建时间" })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;
}
