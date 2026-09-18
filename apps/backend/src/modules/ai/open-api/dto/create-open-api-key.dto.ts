import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateOpenApiKeyDto {
  @IsOptional()
  @IsBoolean({ message: "密钥状态必须是布尔值" })
  status?: boolean;

  @IsOptional()
  @IsString({ message: "密钥备注必须是字符串" })
  @MaxLength(2000, { message: "密钥备注不能超过2000个字符" })
  remark?: string;
}
