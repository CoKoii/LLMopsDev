import { Type } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";

export class QueryAppStatsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30], { message: "统计周期必须为7或30天" })
  days?: number;
}
