import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryRolesDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "角色名称必须为字符串" })
  roleName?: string;
}
