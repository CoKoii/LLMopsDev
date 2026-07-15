import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Llm } from "./entities/llm.entity";
import { LlmController } from "./llm.controller";
import { LlmService } from "./llm.service";

@Module({
  imports: [TypeOrmModule.forFeature([Llm])],
  controllers: [LlmController],
  providers: [LlmService],
})
export class LlmModule {}
