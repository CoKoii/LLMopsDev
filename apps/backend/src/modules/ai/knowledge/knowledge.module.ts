import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FilesModule } from "../../files/files.module";
import { Llm } from "../llm/entities/llm.entity";
import { DocumentProcessProcessor } from "./document-process.processor";
import { DocumentProcessQueueService } from "./document-process-queue.service";
import { DocumentCleanerService } from "./document-cleaner/document-cleaner.service";
import { DocumentChunkerService } from "./document-chunker/document-chunker.service";
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentEnhancerService } from "./document-enhancer/document-enhancer.service";
import { DocumentParserService } from "./document-parser/document-parser.service";
import { DocumentMultimodalExtractionService } from "./document-parser/document-multimodal-extraction.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import { KnowledgeDocumentChunk } from "./entities/knowledge-document-chunk.entity";
import { KnowledgeDocument } from "./entities/knowledge-document.entity";
import { Knowledge } from "./entities/knowledge.entity";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeRecallService } from "./knowledge-recall.service";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Knowledge,
      KnowledgeDocument,
      KnowledgeDocumentChunk,
      Llm,
    ]),
    FilesModule,
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    DocumentMultimodalExtractionService,
    DocumentParserService,
    DocumentCleanerService,
    DocumentEnhancerService,
    DocumentChunkerService,
    DocumentEmbeddingService,
    DocumentVectorStoreService,
    DocumentProcessQueueService,
    DocumentProcessProcessor,
    KnowledgeRecallService,
  ],
  exports: [
    KnowledgeService,
    DocumentMultimodalExtractionService,
    DocumentParserService,
    DocumentCleanerService,
    DocumentChunkerService,
    DocumentEmbeddingService,
    DocumentVectorStoreService,
  ],
})
export class KnowledgeModule {}
