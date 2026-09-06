import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../common/http/page-query.dto";

const transformBoolean = ({ value }: { value: unknown }) =>
  value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : value;

export class QueryAdminResourcesDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "名称必须为字符串" })
  name?: string;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean({ message: "发布状态必须为布尔值" })
  published?: boolean;
}
