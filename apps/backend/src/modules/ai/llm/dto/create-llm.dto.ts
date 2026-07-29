import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from "class-validator";
import { LlmUsageType } from "../entities/llm.entity";

export class CreateLlmDto {
  @IsIn(Object.values(LlmUsageType), { message: "用途不正确" })
  usageType!: LlmUsageType;

  @IsString({ message: "模型名称必须为字符串" })
  @Length(1, 100, { message: "模型名称长度必须在1到100个字符之间" })
  modelName!: string;

  @IsString({ message: "服务地址必须为字符串" })
  @IsUrl(
    {
      protocols: ["http", "https", "ws", "wss"],
      require_tld: false,
    },
    { message: "服务地址必须是合法URL" },
  )
  @Length(1, 1024, { message: "服务地址长度必须在1到1024个字符之间" })
  baseUrl!: string;

  @IsString({ message: "API Key必须为字符串" })
  @Length(1, 1024, { message: "API Key长度必须在1到1024个字符之间" })
  apiKey!: string;

  @IsOptional()
  @IsBoolean({ message: "启用状态必须为布尔值" })
  enabled?: boolean;

  @IsOptional()
  @IsString({ message: "备注必须为字符串" })
  @MaxLength(2000, { message: "备注长度不能超过2000个字符" })
  remark?: string;
}
