import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class UpdateKnowledgeDocumentDto {
  @IsOptional()
  @IsString({ message: "文档名称必须为字符串" })
  @Length(1, 255, { message: "文档名称长度必须在1到255个字符之间" })
  name?: string;

  @IsOptional()
  @IsBoolean({ message: "启用状态必须为布尔值" })
  enabled?: boolean;
}
