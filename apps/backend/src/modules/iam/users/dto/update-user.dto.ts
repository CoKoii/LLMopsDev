import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsString,
  Length,
  IsOptional,
  ArrayUnique,
  ValidateNested,
} from "class-validator";
import { UserStatus } from "../user.entity";

class UpdateUserProfileDto {
  @IsOptional()
  @IsString({ message: "昵称必须为字符串" })
  @Length(1, 20, { message: "昵称长度应在$constraint1到$constraint2之间" })
  nickname?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateUserProfileDto)
  profile?: UpdateUserProfileDto;

  @IsOptional()
  @IsArray({ message: "角色ID必须为数组" })
  @ArrayUnique({ message: "角色ID不能重复" })
  @Type(() => Number)
  @IsInt({ each: true, message: "角色ID必须为整数数组" })
  @Min(1, { each: true, message: "角色ID必须大于0" })
  roles?: number[];

  @IsOptional()
  @IsEnum(UserStatus, { message: "用户状态不合法" })
  status?: UserStatus;
}
