import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { AiAppCategory } from "./app-category.entity";
import { AiAppVersion } from "./app-version.entity";

@Entity({ name: "ai_apps", comment: "AI应用" })
export class AiApp extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "应用名称", length: 100 })
  name!: string;

  @Column({
    comment: "应用图片",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  image?: string | null;

  @Column({ comment: "应用描述", type: "varchar", length: 800, nullable: true })
  description?: string | null;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @Column({ comment: "独立对话页是否公开", default: false })
  published!: boolean;

  @Column({ comment: "独立对话页绑定版本ID", type: "int", nullable: true })
  publishedVersionId?: number | null;

  @ManyToOne(() => AiAppCategory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category?: Relation<AiAppCategory> | null;

  @ManyToOne(() => AiAppVersion, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "publishedVersionId" })
  publishedVersion?: Relation<AiAppVersion> | null;

  @OneToMany(() => AiAppVersion, (version) => version.app)
  versions!: Relation<AiAppVersion[]>;
}
