import type {
  ParsedDocument,
  ParsedDocumentBlock,
} from "../document-parser/document-parser.types";

export interface CleanedDocument extends ParsedDocument {
  blocks: ParsedDocumentBlock[];
  metadata: ParsedDocument["metadata"] & {
    cleaner: string;
    removedBlockCount: number;
    originalCharacterCount: number;
    rules: string[];
  };
}

export interface DocumentCleanerResult {
  document: CleanedDocument;
}
