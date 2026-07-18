import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class DebugAppChatHistoryDto {
  @IsIn(["user", "assistant"], { message: "历史消息角色不合法" })
  role!: "user" | "assistant";

  @IsString({ message: "历史消息内容必须是字符串" })
  @IsNotEmpty({ message: "历史消息内容不能为空" })
  @MaxLength(2000, { message: "历史消息内容不能超过2000个字符" })
  content!: string;
}

export class DebugAppChatDto {
  @IsString({ message: "消息内容必须是字符串" })
  @IsNotEmpty({ message: "消息内容不能为空" })
  @MaxLength(2000, { message: "消息内容不能超过2000个字符" })
  message!: string;

  @IsOptional()
  @IsArray({ message: "历史消息必须是数组" })
  @ArrayMaxSize(200, { message: "历史消息不能超过200条" })
  @ValidateNested({ each: true })
  @Type(() => DebugAppChatHistoryDto)
  history?: DebugAppChatHistoryDto[];
}
