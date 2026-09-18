import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";

export enum LlmUsageType {
  CHAT = "chat",
  STRUCTURED = "structured",
  BUILT_IN_LARGE = "built_in_large",
  EMBEDDING = "embedding",
  MULTIMODAL = "multimodal",
  RERANK = "rerank",
  SPEECH_TO_TEXT = "speech_to_text",
  TEXT_TO_SPEECH = "text_to_speech",
}

export enum LlmTestStatus {
  UNTESTED = "untested",
  SUCCESS = "success",
  FAILED = "failed",
}

@Entity({ name: "ai_llms", comment: "模型配置" })
@Index(["usageType", "isDefault"])
export class Llm extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({
    comment: "用途",
    type: "varchar",
    length: 30,
  })
  usageType!: LlmUsageType;

  @Column({ comment: "模型名称", length: 100 })
  modelName!: string;

  @Column({ comment: "服务地址", length: 1024 })
  baseUrl!: string;

  @Column({ comment: "API Key", length: 1024, select: false })
  apiKey!: string;

  @Column({ comment: "是否启用", default: true })
  enabled!: boolean;

  @Column({ comment: "是否默认", default: false })
  isDefault!: boolean;

  @Column({
    comment: "测试状态",
    type: "varchar",
    length: 20,
    default: LlmTestStatus.UNTESTED,
  })
  lastTestStatus!: LlmTestStatus;

  @Column({ comment: "测试结果", type: "text", nullable: true })
  lastTestMessage?: string | null;

  @Column({ comment: "最后测试时间", type: "timestamp", nullable: true })
  lastTestedAt?: Date | null;

  @Column({ comment: "备注", type: "text", nullable: true })
  remark?: string | null;
}
