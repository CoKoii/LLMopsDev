import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";

export class OpenApiChatDto {
  @IsInt({ message: "app_id必须是整数" })
  @Min(1, { message: "app_id必须大于0" })
  app_id!: number;

  @IsString({ message: "end_user_id必须是字符串" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty({ message: "end_user_id不能为空" })
  @MaxLength(128, { message: "end_user_id不能超过128个字符" })
  end_user_id!: string;

  @IsOptional()
  @IsString({ message: "conversation_id必须是字符串" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(64, { message: "conversation_id不能超过64个字符" })
  conversation_id?: string;

  @IsOptional()
  @IsBoolean({ message: "stream必须是布尔值" })
  stream?: boolean;

  @IsString({ message: "query必须是字符串" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty({ message: "query不能为空" })
  @MaxLength(2000, { message: "query不能超过2000个字符" })
  query!: string;
}
