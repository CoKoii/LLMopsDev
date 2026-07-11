import { IsOptional, IsString } from "class-validator";
import { PageQueryDto } from "../../../../common/http/page-query.dto";

export class QueryUsersDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "昵称必须为字符串" })
  nickname?: string;
}
