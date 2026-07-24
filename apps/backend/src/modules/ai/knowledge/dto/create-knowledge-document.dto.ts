import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateKnowledgeDocumentChunkConfigDto {
  @IsOptional()
  @IsString({ message: "分段标识符必须为字符串" })
  separator?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "分段最大长度必须为整数" })
  @Min(100, { message: "分段最大长度不能小于100" })
  @Max(10000, { message: "分段最大长度不能大于10000" })
  maxSegmentLength?: number;

  @IsOptional()
  @IsBoolean({ message: "空白替换规则必须为布尔值" })
  replaceWhitespace?: boolean;

  @IsOptional()
  @IsBoolean({ message: "URL清理规则必须为布尔值" })
  removeUrls?: boolean;
}

export class CreateKnowledgeDocumentDto {
  @Type(() => Number)
  @IsInt({ message: "文件ID必须为整数" })
  @Min(1, { message: "文件ID必须大于0" })
  fileId!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateKnowledgeDocumentChunkConfigDto)
  chunkConfig?: CreateKnowledgeDocumentChunkConfigDto;
}
