import { IsString, Length } from "class-validator";

export class ChangeCurrentPasswordDto {
  @IsString({ message: "原密码必须为字符串" })
  currentPassword!: string;

  @IsString({ message: "新密码必须为字符串" })
  @Length(6, 20, { message: "新密码长度应在$constraint1到$constraint2之间" })
  newPassword!: string;

  @IsString({ message: "确认密码必须为字符串" })
  confirmPassword!: string;
}
