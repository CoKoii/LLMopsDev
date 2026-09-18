import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class DebugAppChatDto {
  @IsOptional()
  @IsInt({ message: "会话ID必须是整数" })
  @Min(1, { message: "会话ID必须大于0" })
  sessionId?: number;

  @IsString({ message: "消息内容必须是字符串" })
  @IsNotEmpty({ message: "消息内容不能为空" })
  @MaxLength(2000, { message: "消息内容不能超过2000个字符" })
  message!: string;

  @IsOptional()
  @IsArray({ message: "附件文件ID必须是数组" })
  @ArrayMaxSize(20, { message: "单条消息最多上传20个附件" })
  @IsInt({ each: true, message: "附件文件ID必须是整数数组" })
  @Min(1, { each: true, message: "附件文件ID必须大于0" })
  attachmentFileIds?: number[];
}
