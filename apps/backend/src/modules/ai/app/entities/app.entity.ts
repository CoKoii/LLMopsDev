import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
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

  @OneToMany(() => AiAppVersion, (version) => version.app)
  versions!: Relation<AiAppVersion[]>;
}
