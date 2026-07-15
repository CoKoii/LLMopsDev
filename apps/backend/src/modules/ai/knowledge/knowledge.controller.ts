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
import { type AuthUser } from "../../../common/auth/auth-user";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { UpdateKnowledgeDto } from "./dto/update-knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller("ai/knowledge")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // -------------------------
  // 创建知识库
  @Post()
  create(
    @Body() createKnowledgeDto: CreateKnowledgeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.create(createKnowledgeDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取知识库列表
  @Get()
  list(@Query() query: QueryKnowledgeDto) {
    return this.knowledgeService.list(query);
  }
  // -------------------------

  // -------------------------
  // 获取知识库详情
  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.knowledgeService.findOne(id);
  }
  // -------------------------

  // -------------------------
  // 更新知识库
  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateKnowledgeDto: UpdateKnowledgeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.update(id, updateKnowledgeDto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 删除知识库
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.knowledgeService.remove(id);
  }
  // -------------------------
}
