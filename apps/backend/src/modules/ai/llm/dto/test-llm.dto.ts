import { IsOptional, IsString, MaxLength } from "class-validator";

export class TestLlmDto {
  @IsOptional()
  @IsString({ message: "测试内容必须为字符串" })
  @MaxLength(500, { message: "测试内容不能超过500个字符" })
  prompt?: string;
}
