import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../../common/database/base.entity";
import { AiApp } from "./app.entity";

export enum AiAppVersionStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export type AiAppVersionConfig = {
  prompt?: string;
  llmId?: number | null;
  modelSettings?: {
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  };
  capabilities?: Array<{
    key: string;
    title: string;
    description?: string;
    icon?: string;
    tone?: string;
  }>;
  pluginIds?: number[];
  workflowIds?: number[];
  knowledgeIds?: number[];
  toggles?: Record<string, boolean>;
  openingStatement?: {
    content?: string;
    questions?: string[];
  };
};

@Entity({ name: "ai_app_versions", comment: "AI应用版本" })
@Index(["appId", "version"], { unique: true })
export class AiAppVersion extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "应用ID", type: "int" })
  appId!: number;

  @ManyToOne(() => AiApp, (app) => app.versions, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "appId" })
  app!: Relation<AiApp>;

  @Column({ comment: "版本号", length: 32 })
  version!: string;

  @Column({
    comment: "版本状态",
    type: "varchar",
    length: 20,
    default: AiAppVersionStatus.DRAFT,
  })
  status!: AiAppVersionStatus;

  @Column({ comment: "版本配置", type: "json" })
  config!: AiAppVersionConfig;

  @Column({ comment: "发布时间", type: "timestamp", nullable: true })
  publishedAt?: Date | null;
}
