import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class OptimizeAppPromptDto {
  @IsString({ message: "人设与回复逻辑必须是字符串" })
  @IsNotEmpty({ message: "人设与回复逻辑不能为空" })
  @MaxLength(12000, { message: "人设与回复逻辑不能超过12000个字符" })
  prompt!: string;
}
