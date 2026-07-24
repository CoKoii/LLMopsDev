import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class RecallTestDto {
  @IsString({ message: "检索文本必须为字符串" })
  query!: string;

  @IsOptional()
  @IsIn(["hybrid", "vector", "text"], {
    message: "检索策略必须为混合检索、向量检索或全文检索",
  })
  strategy?: "hybrid" | "vector" | "text";

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "最大召回数量必须为整数" })
  @Min(1, { message: "最大召回数量不能小于1" })
  @Max(20, { message: "最大召回数量不能大于20" })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "最小匹配度必须为数字" })
  @Min(0, { message: "最小匹配度不能小于0" })
  @Max(1, { message: "最小匹配度不能大于1" })
  minScore?: number;
}
