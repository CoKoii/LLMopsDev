import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { AuditableEntity } from "../../../common/database/base.entity";
import { Role } from "../roles/role.entity";

@Entity({ name: "permissions", comment: "权限码" })
export class Permission extends AuditableEntity {
  @PrimaryGeneratedColumn({ comment: "权限ID" })
  id!: number;

  @Column({ comment: "权限码", length: 50, unique: true })
  code!: string;

  @Column({ comment: "权限描述", length: 255, nullable: true })
  description!: string;

  @Column({ comment: "状态", default: true })
  status!: boolean;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles!: Relation<Role[]>;
}
