import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { AiApp } from "../../app/entities/app.entity";

export interface PluginHeader {
  key: string;
  value: string;
}

@Entity({ name: "ai_plugins", comment: "插件" })
export class Plugin extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({
    comment: "插件图标",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  icon?: string | null;

  @Column({ comment: "插件名称", length: 100 })
  name!: string;

  @Column({ comment: "插件描述", type: "varchar", length: 800, nullable: true })
  description?: string | null;

  @Column({ comment: "OpenAPI Schema", type: "text" })
  openapiSchema!: string;

  @Column({ comment: "请求头", type: "json", nullable: true })
  headers?: PluginHeader[] | null;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @ManyToMany(() => AiApp, (app) => app.plugins)
  apps!: Relation<AiApp[]>;
}
