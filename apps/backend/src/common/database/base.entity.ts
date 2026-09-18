import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from "typeorm";

export abstract class AuditableEntity {
  @CreateDateColumn({ comment: "创建时间" })
  createdAt!: Date;

  @UpdateDateColumn({ comment: "更新时间" })
  updatedAt!: Date;

  @DeleteDateColumn({ comment: "删除时间", nullable: true })
  deletedAt?: Date | null;

  @Column({ comment: "创建人ID", type: "int", nullable: true })
  createdBy?: number | null;

  @Column({ comment: "更新人ID", type: "int", nullable: true })
  updatedBy?: number | null;
}
