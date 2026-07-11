import { IsString } from "class-validator";

export class LoginDto {
  @IsString({ message: "用户名必须为字符串" })
  username!: string;

  @IsString({ message: "密码必须为字符串" })
  password!: string;
}
