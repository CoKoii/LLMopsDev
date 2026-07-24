import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

export class UpdateKnowledgeDocumentChunkDto {
  @IsOptional()
  @IsString({ message: "片段内容必须为字符串" })
  @Length(1, 20000, { message: "片段内容长度必须在1到20000个字符之间" })
  text?: string;

  @IsOptional()
  @IsArray({ message: "关键词必须为数组" })
  @ArrayMaxSize(10, { message: "关键词最多10个" })
  @IsString({ each: true, message: "关键词必须为字符串" })
  keywords?: string[];

  @IsOptional()
  @IsBoolean({ message: "启用状态必须为布尔值" })
  enabled?: boolean;
}
