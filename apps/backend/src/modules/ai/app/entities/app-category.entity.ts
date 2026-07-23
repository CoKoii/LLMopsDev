import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";

@Entity({ name: "ai_app_categories", comment: "AI应用分类" })
export class AiAppCategory extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "分类编码", length: 50, unique: true })
  key!: string;

  @Column({ comment: "分类名称", length: 100 })
  name!: string;

  @Column({ comment: "排序", type: "int", default: 0 })
  sort!: number;
}
