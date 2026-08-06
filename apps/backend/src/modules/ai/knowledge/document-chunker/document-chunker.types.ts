import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import type { KnowledgeDocumentChunkConfig } from "../knowledge-document-process.types";
import type { ParsedDocumentBlockType } from "../document-parser/document-parser.types";

export interface DocumentChunkerInput {
  knowledgeId: number;
  documentId: number;
  documentName: string;
  contentType: string;
  document: CleanedDocument;
  chunkConfig?: KnowledgeDocumentChunkConfig;
}

export interface DocumentChunkMetadata {
  knowledgeId: number;
  documentId: number;
  documentName: string;
  documentTitle: string;
  contentType: string;
  format: string;
  chunkIndex: number;
  sectionId?: string;
  sectionIndex?: number;
  sectionTitle?: string;
  sectionHeadingPath?: string[];
  sectionSourceBlockIds?: string[];
  sectionTokenCount?: number;
  sectionChunkIndex?: number;
  sectionChunkCount?: number;
  contextualized?: boolean;
  headingPath: string[];
  sourceBlockIds: string[];
  blockTypes: ParsedDocumentBlockType[];
  pages: number[];
  tokenCount: number;
  characterCount: number;
  semanticSimilarity?: {
    min: number;
    max: number;
    average: number;
  };
  overlapFromPrevious: boolean;
  keywords: string[];
  /** 文档级关键词（enhance 阶段生成），用于检索加权，编辑片段时不可改 */
  documentKeywords?: string[];
}

export interface DocumentChunkDraft {
  chunkIndex: number;
  text: string;
  searchText: string;
  embeddingText: string;
  tokenCount: number;
  characterCount: number;
  metadata: DocumentChunkMetadata;
}
