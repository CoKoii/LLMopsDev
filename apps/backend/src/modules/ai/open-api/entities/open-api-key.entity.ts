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

@Entity({ name: "open_api_keys", comment: "开放API密钥" })
@Index(["secretHash"], { unique: true })
@Index(["userId", "createdAt"])
export class OpenApiKey extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "密钥ID" })
  id!: number;

  @Column({ comment: "所属用户ID", type: "int" })
  userId!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({ comment: "密钥前缀", type: "varchar", length: 32 })
  keyPrefix!: string;

  @Column({ comment: "密钥后缀", type: "varchar", length: 8 })
  keySuffix!: string;

  @Column({
    comment: "密钥SHA256",
    type: "varchar",
    length: 64,
    select: false,
  })
  secretHash!: string;

  @Column({ comment: "是否启用", default: true })
  status!: boolean;

  @Column({ comment: "备注", type: "varchar", length: 2000, nullable: true })
  remark?: string | null;

  @Column({ comment: "最后使用时间", type: "timestamp", nullable: true })
  lastUsedAt?: Date | null;
}
