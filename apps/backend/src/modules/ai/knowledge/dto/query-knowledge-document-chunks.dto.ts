import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryKnowledgeDocumentChunksDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "片段关键词必须为字符串" })
  keyword?: string;
}
