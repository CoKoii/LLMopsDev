import { BadRequestException, Injectable } from "@nestjs/common";
import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import type {
  ParsedDocumentBlock,
  ParsedDocumentMetadataValue,
} from "../document-parser/document-parser.types";
import { blocksToText } from "../document-parser/parsers/parser.utils";
import type {
  DocumentEnhancerResult,
  EnhancedDocument,
} from "./document-enhancer.types";

const RULES = [
  "preserve-cleaned-block-text",
  "generate-rule-summary",
  "extract-rule-keywords",
];

const MAX_SUMMARY_BLOCKS = 6;
const MAX_KEYWORDS = 20;

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const unique = <T>(items: T[]) => Array.from(new Set(items));

const createSummary = (document: CleanedDocument) => {
  const headings = document.blocks
    .filter((block) => block.type === "heading")
    .map((block) => compact(block.text))
    .filter(Boolean)
    .slice(0, MAX_SUMMARY_BLOCKS);
  const firstParagraphs = document.blocks
    .filter((block) => block.type === "paragraph" || block.type === "list")
    .map((block) => compact(block.text))
    .filter(Boolean)
    .slice(0, 2);

  return unique([document.title, ...headings, ...firstParagraphs]).join("。");
};

const keywordCandidatesFromText = (text: string) =>
  text
    .split(/[^\p{L}\p{N}_./-]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40);

const createKeywords = (document: CleanedDocument) => {
  const candidates: string[] = [];

  candidates.push(...keywordCandidatesFromText(document.title));
  for (const block of document.blocks) {
    if (block.type === "heading") {
      candidates.push(...keywordCandidatesFromText(block.text));
    }
    if (block.metadata?.method && block.metadata?.path) {
      candidates.push(
        String(block.metadata.method),
        String(block.metadata.path),
      );
    }
    if (block.type === "table") {
      candidates.push(...(block.rows?.[0] ?? []));
    }
  }

  return unique(candidates.map(compact).filter(Boolean)).slice(0, MAX_KEYWORDS);
};

const createBlockMetadata = (block: ParsedDocumentBlock) =>
  ({
    ...block.metadata,
    enhancedBy: "rule",
    sourceBlockId: block.id,
    sourceBlockType: block.type,
    sourceTextLength: block.text.length,
  }) satisfies Record<string, ParsedDocumentMetadataValue>;

@Injectable()
export class DocumentEnhancerService {
  enhance(cleanedDocument: CleanedDocument): DocumentEnhancerResult {
    if (!cleanedDocument.blocks.length) {
      throw new BadRequestException("清洗结果为空，无法增强");
    }

    const enhancedBlocks = cleanedDocument.blocks.map((block, index) => ({
      ...block,
      id: `block-${index + 1}`,
      metadata: createBlockMetadata(block),
    }));
    const text = blocksToText(enhancedBlocks);

    const document: EnhancedDocument = {
      ...cleanedDocument,
      text,
      characterCount: text.length,
      blocks: enhancedBlocks,
      metadata: {
        ...cleanedDocument.metadata,
        blockCount: enhancedBlocks.length,
        enhancer: "rule",
        sourceCharacterCount: cleanedDocument.characterCount,
        summary: createSummary(cleanedDocument),
        keywords: createKeywords(cleanedDocument),
        enhancementRules: RULES,
      },
    };

    return { document };
  }
}
