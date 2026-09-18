import { IsIn, IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryAppsDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "名称必须为字符串" })
  name?: string;

  @IsOptional()
  @IsIn(["mine", "available"], { message: "范围必须为 mine 或 available" })
  scope?: "mine" | "available";

  @IsOptional()
  @IsString({ message: "应用分类必须为字符串" })
  categoryKey?: string;
}
