import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryPermissionsDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "权限代码必须为字符串" })
  code?: string;
}
