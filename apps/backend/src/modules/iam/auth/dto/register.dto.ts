import { IsNotEmpty, IsOptional, IsString, Length } from "class-validator";

export class RegisterDto {
  @IsString({ message: "用户名必须为字符串" })
  @Length(6, 50, { message: "用户名长度应在$constraint1到$constraint2之间" })
  username!: string;

  @IsString({ message: "密码必须为字符串" })
  @Length(6, 20, { message: "密码长度应在$constraint1到$constraint2之间" })
  password!: string;
  @IsOptional()
  @IsNotEmpty({ message: "二次确认密码不能为空" })
  confirmPassword?: string;
}
