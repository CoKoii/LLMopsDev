import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from "class-validator";

class PluginHeaderDto {
  @IsString({ message: "Header Key必须为字符串" })
  @MaxLength(100, { message: "Header Key长度不能超过100个字符" })
  key!: string;

  @IsString({ message: "Header Value必须为字符串" })
  @MaxLength(500, { message: "Header Value长度不能超过500个字符" })
  value!: string;
}

export class CreatePluginDto {
  @IsOptional()
  @IsString({ message: "插件图标必须为字符串" })
  @MaxLength(1024, { message: "插件图标长度不能超过1024个字符" })
  icon?: string;

  @IsOptional()
  @IsInt({ message: "插件图标文件ID必须为整数" })
  iconFileId?: number;

  @IsString({ message: "插件名称必须为字符串" })
  @Length(1, 100, { message: "插件名称长度必须在1到100个字符之间" })
  name!: string;

  @IsOptional()
  @IsString({ message: "插件描述必须为字符串" })
  @MaxLength(800, { message: "插件描述长度不能超过800个字符" })
  description?: string;

  @IsInt({ message: "插件分类ID必须为整数" })
  categoryId!: number;

  @IsString({ message: "OpenAPI Schema必须为字符串" })
  @IsNotEmpty({ message: "OpenAPI Schema不能为空" })
  openapiSchema!: string;

  @IsOptional()
  @IsArray({ message: "Headers必须为数组" })
  @ValidateNested({ each: true })
  @Type(() => PluginHeaderDto)
  headers?: PluginHeaderDto[];

  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;

  @IsOptional()
  @IsBoolean({ message: "是否发布必须为布尔值" })
  published?: boolean;
}
