import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class UpdateCurrentProfileDto {
  @IsOptional()
  @IsString({ message: "昵称必须为字符串" })
  @Length(1, 20, { message: "昵称长度应在$constraint1到$constraint2之间" })
  nickname?: string;

  @IsOptional()
  @IsString({ message: "头像必须为字符串" })
  @MaxLength(1024, { message: "头像长度不能超过1024个字符" })
  avatar?: string;

  @IsOptional()
  @IsInt({ message: "头像文件ID必须为整数" })
  avatarFileId?: number;
}
