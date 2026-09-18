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
import { CreateKnowledgeDocumentChunkDto } from "./dto/create-knowledge-document-chunk.dto";
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { CreateKnowledgeDto } from "./dto/create-knowledge.dto";
import { CleanWebClipDto } from "./dto/clean-web-clip.dto";
import { QueryKnowledgeDocumentChunksDto } from "./dto/query-knowledge-document-chunks.dto";
import { QueryKnowledgeDocumentsDto } from "./dto/query-knowledge-documents.dto";
import { QueryKnowledgeDto } from "./dto/query-knowledge.dto";
import { RecallTestDto } from "./dto/recall-test.dto";
import { ReprocessKnowledgeDocumentDto } from "./dto/reprocess-knowledge-document.dto";
import { UpdateKnowledgeDocumentChunkDto } from "./dto/update-knowledge-document-chunk.dto";
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
  // 清洗网页剪藏内容
  @Post("web-clips/clean")
  cleanWebClip(@Body() dto: CleanWebClipDto, @CurrentUser() user: AuthUser) {
    return this.knowledgeService.cleanWebClip(dto, user.userId);
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
  // 获取文档片段列表
  @Get(":id/documents/:documentId/chunks")
  listDocumentChunks(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Query() query: QueryKnowledgeDocumentChunksDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.listDocumentChunks(
      id,
      documentId,
      query,
      user.userId,
    );
  }
  // -------------------------

  // -------------------------
  // 添加文档片段
  @Post(":id/documents/:documentId/chunks")
  createDocumentChunk(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Body() dto: CreateKnowledgeDocumentChunkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.createDocumentChunk(
      id,
      documentId,
      dto,
      user.userId,
    );
  }
  // -------------------------

  // -------------------------
  // 更新文档片段
  @Put(":id/documents/:documentId/chunks/:chunkId")
  updateDocumentChunk(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Param("chunkId", ParseIntPipe) chunkId: number,
    @Body() dto: UpdateKnowledgeDocumentChunkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.updateDocumentChunk(
      id,
      documentId,
      chunkId,
      dto,
      user.userId,
    );
  }
  // -------------------------

  // -------------------------
  // 删除文档片段
  @Delete(":id/documents/:documentId/chunks/:chunkId")
  removeDocumentChunk(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Param("chunkId", ParseIntPipe) chunkId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.removeDocumentChunk(
      id,
      documentId,
      chunkId,
      user.userId,
    );
  }
  // -------------------------

  // -------------------------
  // 召回测试
  @Post(":id/recall-test")
  recallTest(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RecallTestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.recallTest(id, dto, user.userId);
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
  // 重新处理知识库文档
  @Post(":id/documents/:documentId/reprocess")
  reprocessDocument(
    @Param("id", ParseIntPipe) id: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Body() dto: ReprocessKnowledgeDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.knowledgeService.reprocessDocument(
      id,
      documentId,
      dto,
      user.userId,
    );
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
