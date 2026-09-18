import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";

export class CreatePermissionDto {
  @IsString({ message: "权限代码必须为字符串" })
  @Matches(/^\S+$/, { message: "权限代码不能包含空格" })
  @Length(1, 50, { message: "权限代码长度必须在1到50个字符之间" })
  code!: string;

  @IsOptional()
  @IsString({ message: "权限描述必须为字符串" })
  @Length(0, 255, { message: "权限描述长度不能超过255个字符" })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;
}
