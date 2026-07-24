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
  "prepend-document-title",
  "prepend-heading-context",
  "describe-tables",
  "describe-api-code-blocks",
  "generate-rule-summary",
  "extract-rule-keywords",
];

const MAX_SUMMARY_BLOCKS = 6;
const MAX_KEYWORDS = 20;
const MAX_TABLE_ROWS_IN_DESCRIPTION = 8;

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const unique = <T>(items: T[]) => Array.from(new Set(items));

const headingPathText = (block: ParsedDocumentBlock) =>
  block.headingPath?.map(compact).filter(Boolean).join(" / ") ?? "";

const withContext = (
  document: CleanedDocument,
  block: ParsedDocumentBlock,
  content: string,
) =>
  [
    `文档：${document.title}`,
    headingPathText(block) ? `章节：${headingPathText(block)}` : undefined,
    content,
  ]
    .filter(Boolean)
    .join("\n");

const tableDescription = (block: ParsedDocumentBlock) => {
  const rows = block.rows ?? [];
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1, MAX_TABLE_ROWS_IN_DESCRIPTION + 1);

  if (!rows.length) return `表格内容：\n${block.text}`;

  const fields = header.length ? `表格字段：${header.join("、")}` : undefined;
  const rowTexts = bodyRows.map((row, index) => {
    const cells = row.map((cell, cellIndex) => {
      const key = header[cellIndex] || `第${cellIndex + 1}列`;
      return `${key}=${cell}`;
    });
    return `第${index + 1}行：${cells.join("；")}`;
  });

  return [fields, ...rowTexts, `原始表格：\n${block.text}`]
    .filter(Boolean)
    .join("\n");
};

const codeDescription = (block: ParsedDocumentBlock) => {
  const method = block.metadata?.method;
  const path = block.metadata?.path;
  const endpoint =
    typeof method === "string" && typeof path === "string"
      ? `接口：${method} ${path}`
      : undefined;
  const language = block.language ? `代码语言：${block.language}` : undefined;

  return [endpoint, language, `代码内容：\n${block.text}`]
    .filter(Boolean)
    .join("\n");
};

const enhanceBlockText = (
  document: CleanedDocument,
  block: ParsedDocumentBlock,
) => {
  if (block.type === "heading") return `章节标题：${block.text}`;
  if (block.type === "table") {
    return withContext(document, block, tableDescription(block));
  }
  if (block.type === "code") {
    return withContext(document, block, codeDescription(block));
  }
  if (block.type === "json") {
    return withContext(document, block, `JSON内容：\n${block.text}`);
  }
  if (block.type === "list") {
    return withContext(document, block, `列表项：${block.text}`);
  }
  return withContext(document, block, `内容：${block.text}`);
};

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
      candidates.push(String(block.metadata.method), String(block.metadata.path));
    }
    if (block.type === "table") {
      candidates.push(...(block.rows?.[0] ?? []));
    }
  }

  return unique(candidates.map(compact).filter(Boolean)).slice(0, MAX_KEYWORDS);
};

const createBlockMetadata = (block: ParsedDocumentBlock) => ({
  ...block.metadata,
  enhancedBy: "rule",
  sourceBlockId: block.id,
  sourceBlockType: block.type,
  sourceTextLength: block.text.length,
} satisfies Record<string, ParsedDocumentMetadataValue>);

@Injectable()
export class DocumentEnhancerService {
  enhance(cleanedDocument: CleanedDocument): DocumentEnhancerResult {
    if (!cleanedDocument.blocks.length) {
      throw new BadRequestException("清洗结果为空，无法增强");
    }

    const enhancedBlocks = cleanedDocument.blocks.map((block, index) => ({
      ...block,
      id: `block-${index + 1}`,
      text: enhanceBlockText(cleanedDocument, block),
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
