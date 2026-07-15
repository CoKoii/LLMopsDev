import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { AiApp } from "../../app/entities/app.entity";

@Entity({ name: "ai_workflows", comment: "工作流" })
export class Workflow extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({
    comment: "工作流图标",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  icon?: string | null;

  @Column({ comment: "中文名称", length: 100 })
  name!: string;

  @Column({ comment: "英文名称", length: 100 })
  englishName!: string;

  @Column({
    comment: "工作流描述",
    type: "varchar",
    length: 800,
    nullable: true,
  })
  description?: string | null;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @ManyToMany(() => AiApp, (app) => app.workflows)
  apps!: Relation<AiApp[]>;
}
