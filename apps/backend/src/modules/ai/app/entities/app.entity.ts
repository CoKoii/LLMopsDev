import { Column, PrimaryGeneratedColumn } from "typeorm";

export class App {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "应用名称", length: 50, unique: true })
  appName!: string;

  @Column({ comment: "应用描述", length: 255, nullable: true })
  description!: string;

  @Column({ comment: "状态", default: true })
  status!: boolean;
}
