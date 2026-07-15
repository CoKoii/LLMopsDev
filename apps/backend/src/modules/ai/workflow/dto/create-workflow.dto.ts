import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class CreateWorkflowDto {
  @IsOptional()
  @IsString({ message: "工作流图标必须为字符串" })
  @MaxLength(1024, { message: "工作流图标长度不能超过1024个字符" })
  icon?: string;

  @IsOptional()
  @IsInt({ message: "工作流图标文件ID必须为整数" })
  iconFileId?: number;

  @IsString({ message: "中文名称必须为字符串" })
  @Length(1, 100, { message: "中文名称长度必须在1到100个字符之间" })
  name!: string;

  @IsString({ message: "英文名称必须为字符串" })
  @Length(1, 100, { message: "英文名称长度必须在1到100个字符之间" })
  englishName!: string;

  @IsOptional()
  @IsString({ message: "工作流描述必须为字符串" })
  @MaxLength(800, { message: "工作流描述长度不能超过800个字符" })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;
}
