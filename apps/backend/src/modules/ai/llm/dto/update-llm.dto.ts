import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateLlmDto } from "./create-llm.dto";

export class UpdateLlmDto extends PartialType(
  OmitType(CreateLlmDto, ["usageType"] as const),
) {}
