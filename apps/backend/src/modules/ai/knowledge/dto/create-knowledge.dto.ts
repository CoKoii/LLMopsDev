import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class CreateKnowledgeDto {
  @IsOptional()
  @IsString({ message: "知识库图标必须为字符串" })
  @MaxLength(1024, { message: "知识库图标长度不能超过1024个字符" })
  icon?: string;

  @IsOptional()
  @IsInt({ message: "知识库图标文件ID必须为整数" })
  iconFileId?: number;

  @IsString({ message: "知识库名称必须为字符串" })
  @Length(1, 100, { message: "知识库名称长度必须在1到100个字符之间" })
  name!: string;

  @IsOptional()
  @IsString({ message: "知识库描述必须为字符串" })
  @MaxLength(2000, { message: "知识库描述长度不能超过2000个字符" })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;
}
