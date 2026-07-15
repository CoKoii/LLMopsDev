import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryKnowledgeDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "名称必须为字符串" })
  name?: string;
}
