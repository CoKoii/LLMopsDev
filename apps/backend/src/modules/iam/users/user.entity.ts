import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../common/database/base.entity";
import { Profile } from "../profiles/profile.entity";
import { Role } from "../roles/role.entity";

export enum UserStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  LOCKED = "locked",
}

@Entity({ name: "users", comment: "用户" })
export class User extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "用户ID" })
  id!: number;

  @Column({ comment: "用户名", length: 50, unique: true })
  username!: string;

  @Column({ comment: "用户密码", length: 255, select: false })
  password!: string;

  @Column({
    comment: "账户状态",
    type: "varchar",
    length: 20,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @OneToOne(() => Profile, (profile) => profile.user, { cascade: true })
  profile!: Relation<Profile>;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: "users_roles" })
  roles!: Relation<Role[]>;
}
