import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { CreateKnowledgeDocumentChunkConfigDto } from "./create-knowledge-document.dto";

export class ReprocessKnowledgeDocumentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateKnowledgeDocumentChunkConfigDto)
  chunkConfig?: CreateKnowledgeDocumentChunkConfigDto;
}
