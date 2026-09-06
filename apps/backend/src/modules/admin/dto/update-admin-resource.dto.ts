import { IsBoolean, IsOptional } from "class-validator";

export class UpdateAdminResourceDto {
  @IsOptional()
  @IsBoolean({ message: "状态必须为布尔值" })
  status?: boolean;

  @IsOptional()
  @IsBoolean({ message: "发布状态必须为布尔值" })
  published?: boolean;
}
