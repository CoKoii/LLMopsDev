import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../common/database/base.entity";
import { Permission } from "../permissions/permission.entity";
import { User } from "../users/user.entity";

@Entity({ name: "roles", comment: "角色" })
export class Role extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "主键ID" })
  id!: number;

  @Column({ comment: "角色名称", length: 50, unique: true })
  roleName!: string;

  @Column({ comment: "角色描述", length: 255, nullable: true })
  description!: string;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @ManyToMany(() => User, (user) => user.roles)
  users!: Relation<User[]>;

  @ManyToMany(() => Permission, (permission) => permission.roles)
  @JoinTable({ name: "roles_permissions" })
  permissions!: Relation<Permission[]>;
}
