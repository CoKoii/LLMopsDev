import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateStandaloneSessionDto {
  @IsString({ message: "会话标题必须是字符串" })
  @IsNotEmpty({ message: "会话标题不能为空" })
  @MaxLength(120, { message: "会话标题不能超过120个字符" })
  title!: string;
}
