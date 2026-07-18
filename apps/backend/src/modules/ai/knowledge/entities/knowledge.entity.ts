import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";

@Entity({ name: "ai_knowledge", comment: "知识库" })
export class Knowledge extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({
    comment: "知识库图标",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  icon?: string | null;

  @Column({ comment: "知识库名称", length: 100 })
  name!: string;

  @Column({
    comment: "知识库描述",
    type: "varchar",
    length: 2000,
    nullable: true,
  })
  description?: string | null;

  @Column({ comment: "状态", default: true })
  status!: boolean;
}
