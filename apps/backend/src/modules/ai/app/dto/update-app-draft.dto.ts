import { IsObject, IsOptional } from "class-validator";
import type { AiAppVersionConfig } from "../entities/app-version.entity";

export class UpdateAppDraftDto {
  @IsOptional()
  @IsObject({ message: "版本配置必须是对象" })
  config?: AiAppVersionConfig;
}
