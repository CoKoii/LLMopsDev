import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class CreateAppDto {
  @IsString({ message: "应用名称必须为字符串" })
  @Length(1, 100, { message: "应用名称长度必须在1到100个字符之间" })
  name!: string;

  @IsOptional()
  @IsString({ message: "应用图片必须为字符串" })
  @MaxLength(1024, { message: "应用图片长度不能超过1024个字符" })
  image?: string;

  @IsOptional()
  @IsInt({ message: "应用图片文件ID必须为整数" })
  imageFileId?: number;

  @IsOptional()
  @IsString({ message: "应用描述必须为字符串" })
  @MaxLength(800, { message: "应用描述长度不能超过800个字符" })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;
}
