import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../common/database/base.entity";
import { User } from "../users/user.entity";

@Entity({ name: "profiles", comment: "用户资料" })
export class Profile extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "昵称", length: 50 })
  nickname!: string;

  @Column({ comment: "头像", type: "varchar", length: 1024, nullable: true })
  avatar?: string | null;

  @OneToOne(() => User, (user) => user.profile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;
}
