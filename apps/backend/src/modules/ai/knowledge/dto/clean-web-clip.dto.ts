import { IsOptional, IsString, MaxLength } from "class-validator";

export class CleanWebClipDto {
  @IsOptional()
  @IsString({ message: "标题必须为字符串" })
  @MaxLength(300, { message: "标题不能超过300个字符" })
  title?: string;

  @IsOptional()
  @IsString({ message: "来源地址必须为字符串" })
  @MaxLength(2048, { message: "来源地址不能超过2048个字符" })
  url?: string;

  @IsOptional()
  @IsString({ message: "HTML内容必须为字符串" })
  @MaxLength(120000, { message: "HTML内容不能超过120000个字符" })
  html?: string;

  @IsString({ message: "正文内容必须为字符串" })
  @MaxLength(120000, { message: "正文内容不能超过120000个字符" })
  text!: string;

  @IsOptional()
  @IsString({ message: "Markdown草稿必须为字符串" })
  @MaxLength(120000, { message: "Markdown草稿不能超过120000个字符" })
  markdown?: string;
}
