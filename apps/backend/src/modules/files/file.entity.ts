import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../common/database/base.entity";
import { User } from "../iam/users/user.entity";

export const FILE_STATUS = {
  PENDING: "pending",
  UPLOADED: "uploaded",
  USED: "used",
} as const;

export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

@Entity({ name: "files", comment: "文件" })
export class FileEntity extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "文件ID" })
  id!: number;

  @Column({ comment: "上传用户ID" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @Column({ comment: "原始文件名", length: 255 })
  originalName!: string;

  @Column({ comment: "文件类型", length: 100 })
  contentType!: string;

  @Column({ comment: "文件大小" })
  size!: number;

  @Column({ comment: "OSS对象Key", length: 512, unique: true })
  objectKey!: string;

  @Column({ comment: "访问地址", length: 1024 })
  url!: string;

  @Column({
    comment: "文件状态",
    type: "varchar",
    length: 20,
    default: FILE_STATUS.PENDING,
  })
  status!: FileStatus;

  @Column({ comment: "使用时间", type: "timestamp", nullable: true })
  usedAt?: Date | null;
}
