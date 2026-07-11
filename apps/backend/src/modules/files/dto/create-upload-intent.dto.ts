import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

export class CreateUploadIntentDto {
  @IsString({ message: "文件名必须为字符串" })
  @IsNotEmpty({ message: "文件名不能为空" })
  @MaxLength(255, { message: "文件名长度不能超过255个字符" })
  filename!: string;

  @IsString({ message: "文件类型必须为字符串" })
  @IsNotEmpty({ message: "文件类型不能为空" })
  @MaxLength(100, { message: "文件类型长度不能超过100个字符" })
  contentType!: string;

  @IsInt({ message: "文件大小必须为整数" })
  @Min(1, { message: "文件大小必须大于0" })
  size!: number;
}
