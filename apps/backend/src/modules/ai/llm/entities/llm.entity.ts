import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";

@Entity({ name: "ai_llms", comment: "大模型" })
export class Llm extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "供应商", length: 50 })
  provider!: string;

  @Column({ comment: "模型名称", length: 100 })
  modelName!: string;

  @Column({ comment: "服务地址", length: 1024 })
  url!: string;

  @Column({ comment: "API Key", length: 512 })
  apiKey!: string;
}
