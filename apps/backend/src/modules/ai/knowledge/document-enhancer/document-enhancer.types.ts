import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import type {
  ParsedDocument,
  ParsedDocumentBlock,
} from "../document-parser/document-parser.types";

export interface EnhancedDocument extends ParsedDocument {
  blocks: ParsedDocumentBlock[];
  metadata: CleanedDocument["metadata"] & {
    enhancer: string;
    sourceCharacterCount: number;
    summary: string;
    keywords: string[];
    enhancementRules: string[];
  };
}

export interface DocumentEnhancerResult {
  document: EnhancedDocument;
}
