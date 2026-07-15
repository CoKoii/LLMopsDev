import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { Knowledge } from "../../knowledge/entities/knowledge.entity";
import { Llm } from "../../llm/entities/llm.entity";
import { Plugin } from "../../plugin/entities/plugin.entity";
import { Workflow } from "../../workflow/entities/workflow.entity";

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

  @Column({ comment: "绑定大模型ID", type: "int", nullable: true })
  llmId?: number | null;

  @ManyToOne(() => Llm, (llm) => llm.apps, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "llmId" })
  llm?: Relation<Llm | null>;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @ManyToMany(() => Plugin, (plugin) => plugin.apps)
  @JoinTable({ name: "ai_apps_plugins" })
  plugins!: Relation<Plugin[]>;

  @ManyToMany(() => Workflow, (workflow) => workflow.apps)
  @JoinTable({ name: "ai_apps_workflows" })
  workflows!: Relation<Workflow[]>;

  @ManyToMany(() => Knowledge, (knowledge) => knowledge.apps)
  @JoinTable({ name: "ai_apps_knowledge" })
  knowledgeBases!: Relation<Knowledge[]>;
}
