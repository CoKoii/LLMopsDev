import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class HomeBuilderHistoryMessageDto {
  @IsString({ message: "角色必须为字符串" })
  role!: "user" | "assistant";

  @IsString({ message: "消息内容必须为字符串" })
  @MaxLength(4000, { message: "历史消息内容不能超过4000个字符" })
  content!: string;
}

export class CreateHomeBuilderPlanDto {
  @IsString({ message: "消息内容必须为字符串" })
  @MaxLength(8000, { message: "消息内容不能超过8000个字符" })
  message!: string;

  @IsOptional()
  @IsArray({ message: "历史消息必须为数组" })
  @ValidateNested({ each: true })
  @Type(() => HomeBuilderHistoryMessageDto)
  history?: HomeBuilderHistoryMessageDto[];

  @IsOptional()
  @IsObject({ message: "待确认方案必须为对象" })
  pendingPlan?: Record<string, unknown>;
}
