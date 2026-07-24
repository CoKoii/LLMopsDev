import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class CreateKnowledgeDocumentDto {
  @Type(() => Number)
  @IsInt({ message: "文件ID必须为整数" })
  @Min(1, { message: "文件ID必须大于0" })
  fileId!: number;
}
