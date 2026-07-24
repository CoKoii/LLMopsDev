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
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { QueryKnowledgeDocumentsDto } from "./dto/query-knowledge-documents.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { UpdateKnowledgeDocumentDto } from "./dto/update-knowledge-document.dto";
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
  list(@Query() query: QueryKnowledgeDto, @CurrentUser() user: AuthUser) {
    return this.knowledgeService.list(query, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取知识库文档列表
  @Get(":id/documents")
  listDocuments(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: QueryKnowledgeDocumentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.listDocuments(id, query, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取知识库文档详情
  @Get(":id/documents/:documentId")
  findDocument(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.findDocument(id, documentId, user.userId);
  }
  // -------------------------

  // -------------------------
  // 添加知识库文档
  @Post(":id/documents")
  createDocument(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateKnowledgeDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.createDocument(id, dto, user.userId);
  }
  // -------------------------

  // -------------------------
  // 更新知识库文档
  @Put(":id/documents/:documentId")
  updateDocument(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Body() dto: UpdateKnowledgeDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.updateDocument(
      id,
      documentId,
      dto,
      user.userId,
    );
  }
  // -------------------------

  // -------------------------
  // 删除知识库文档
  @Delete(":id/documents/:documentId")
  removeDocument(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.removeDocument(id, documentId, user.userId);
  }
  // -------------------------

  // -------------------------
  // 获取知识库详情
  @Get(":id")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.findOne(id, user.userId);
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
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.knowledgeService.remove(id, user.userId);
  }
  // -------------------------
}
