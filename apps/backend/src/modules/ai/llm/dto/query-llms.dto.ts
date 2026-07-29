import { IsIn, IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";
import { LlmUsageType } from "../entities/llm.entity";

export class QueryLlmsDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "名称必须为字符串" })
  name?: string;

  @IsOptional()
  @IsIn(Object.values(LlmUsageType), { message: "用途不正确" })
  usageType?: LlmUsageType;
}
