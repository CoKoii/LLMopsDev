export type ParsedDocumentBlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "list"
  | "code"
  | "json";

export type ParsedDocumentMetadataValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export interface ParsedDocumentBlock {
  id: string;
  type: ParsedDocumentBlockType;
  text: string;
  level?: number;
  page?: number;
  language?: string;
  headingPath?: string[];
  rows?: string[][];
  metadata?: Record<string, ParsedDocumentMetadataValue>;
}

export interface DocumentParserInput {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface DocumentParserResult {
  format: string;
  parser: string;
  blocks: ParsedDocumentBlock[];
  warnings?: string[];
  tokens?: number;
}

export interface DocumentFormatParser {
  supports(input: DocumentParserInput): boolean;
  parse(
    input: DocumentParserInput,
  ): Promise<DocumentParserResult> | DocumentParserResult;
}

export interface ParsedDocument {
  title: string;
  format: string;
  contentType: string;
  text: string;
  characterCount: number;
  blocks: ParsedDocumentBlock[];
  metadata: {
    parser: string;
    blockCount: number;
    warnings?: string[];
    tokens?: number;
  };
}
