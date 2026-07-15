import { IsString, Length, MaxLength } from "class-validator";

export class CreateLlmDto {
  @IsString({ message: "供应商必须为字符串" })
  @Length(1, 50, { message: "供应商长度必须在1到50个字符之间" })
  provider!: string;

  @IsString({ message: "模型名称必须为字符串" })
  @Length(1, 100, { message: "模型名称长度必须在1到100个字符之间" })
  modelName!: string;

  @IsString({ message: "服务地址必须为字符串" })
  @Length(1, 1024, { message: "服务地址长度必须在1到1024个字符之间" })
  url!: string;

  @IsString({ message: "API Key必须为字符串" })
  @MaxLength(512, { message: "API Key长度不能超过512个字符" })
  apiKey!: string;
}
