import { Type } from "class-transformer";
import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from "class-validator";

export class CreateRoleDto {
  @IsString({ message: "角色名称必须为字符串" })
  @IsNotEmpty({ message: "角色名称不能为空" })
  @Matches(/^\S+$/, { message: "角色名称不能包含空格" })
  @Length(2, 50, { message: "角色名称长度必须在2到50个字符之间" })
  roleName!: string;

  @IsOptional()
  @IsString({ message: "角色描述必须为字符串" })
  @Length(0, 255, { message: "角色描述长度不能超过255个字符" })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;

  @IsOptional()
  @IsArray({ message: "权限ID必须为数组" })
  @ArrayUnique({ message: "权限ID不能重复" })
  @Type(() => Number)
  @IsInt({ each: true, message: "权限ID必须为整数数组" })
  @Min(1, { each: true, message: "权限ID必须大于0" })
  permissions?: number[];
}
