import { IsString, MaxLength } from "class-validator";

export class UpdateChatMemoryDto {
  @IsString()
  @MaxLength(12000)
  content!: string;
}
