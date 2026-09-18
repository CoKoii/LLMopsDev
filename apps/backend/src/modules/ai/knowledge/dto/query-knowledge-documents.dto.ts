import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryKnowledgeDocumentsDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "文档名称必须为字符串" })
  name?: string;
}
