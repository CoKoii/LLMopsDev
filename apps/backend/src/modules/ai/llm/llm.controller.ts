import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CreateLlmDto } from "./dto/create-llm.dto";
import { QueryLlmsDto } from "./dto/query-llms.dto";
import { TestLlmDto } from "./dto/test-llm.dto";
import { UpdateLlmDto } from "./dto/update-llm.dto";
import { LlmService } from "./llm.service";

@Controller("ai/llms")
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  // -------------------------
  // 创建大模型
  @Post()
  create(@Body() createLlmDto: CreateLlmDto) {
    return this.llmService.create(createLlmDto);
  }
  // -------------------------

  // -------------------------
  // 获取大模型列表
  @Get()
  list(@Query() query: QueryLlmsDto) {
    return this.llmService.list(query);
  }
  // -------------------------

  // -------------------------
  // 获取大模型详情
  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.llmService.findOne(id);
  }
  // -------------------------

  // -------------------------
  // 测试模型连通性
  @Post(":id/test")
  test(@Param("id", ParseIntPipe) id: number, @Body() dto: TestLlmDto) {
    return this.llmService.test(id, dto);
  }
  // -------------------------

  // -------------------------
  // 更新大模型
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateLlmDto: UpdateLlmDto,
  ) {
    return this.llmService.update(id, updateLlmDto);
  }
  // -------------------------

  // -------------------------
  // 删除大模型
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.llmService.remove(id);
  }
  // -------------------------
}
