import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ParsedDocument,
  ParsedDocumentBlock,
} from "../document-parser/document-parser.types";
import {
  blocksToText,
  normalizeText,
} from "../document-parser/parsers/parser.utils";
import type { KnowledgeDocumentChunkConfig } from "../knowledge-document-process.types";
import type {
  CleanedDocument,
  DocumentCleanerResult,
} from "./document-cleaner.types";

const PRESERVE_FORMAT_TYPES = new Set<ParsedDocumentBlock["type"]>([
  "code",
  "json",
]);

const PAGE_MARK_PATTERNS = [
  /^[-–—\s]*page\s+\d+(\s+(of|\/)\s+\d+)?[-–—\s]*$/i,
  /^[-–—\s]*\d+\s+of\s+\d+[-–—\s]*$/i,
  /^[-–—\s]*\d+\s*\/\s*\d+[-–—\s]*$/,
  /^[-–—\s]*第\s*\d+\s*页(\s*[/／]\s*共?\s*\d+\s*页?)?[-–—\s]*$/,
];

const RULES = [
  "remove-control-characters",
  "normalize-whitespace",
  "remove-page-mark-lines",
  "trim-empty-blocks",
  "dedupe-adjacent-blocks",
];

const URL_OR_EMAIL_PATTERN =
  /https?:\/\/\S+|www\.\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const shouldRemoveCharacter = (value: string) => {
  const code = value.charCodeAt(0);
  return (
    code === 0 ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0xfeff ||
    (code >= 0x00 && code <= 0x08) ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
};

const removeControlCharacters = (value: string) =>
  Array.from(value)
    .filter((item) => !shouldRemoveCharacter(item))
    .join("");

const isPageMarkLine = (value: string) => {
  const text = value.trim();
  return PAGE_MARK_PATTERNS.some((pattern) => pattern.test(text));
};

const applyCustomCleaning = (
  value: string,
  config?: KnowledgeDocumentChunkConfig,
) => {
  let text = value;
  if (config?.removeUrls) {
    text = text.replace(URL_OR_EMAIL_PATTERN, "");
  }
  if (config?.replaceWhitespace) {
    text = text.replace(/\s+/g, " ");
  }
  return text;
};

const cleanFreeText = (value: string, config?: KnowledgeDocumentChunkConfig) =>
  applyCustomCleaning(removeControlCharacters(value), config)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((line) => line && !isPageMarkLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const cleanPreservedText = (
  value: string,
  config?: KnowledgeDocumentChunkConfig,
) =>
  normalizeText(
    applyCustomCleaning(removeControlCharacters(value), config),
  ).replace(/\n{4,}/g, "\n\n\n");

const cleanTableRows = (
  rows?: string[][],
  config?: KnowledgeDocumentChunkConfig,
) =>
  rows
    ?.map((row) => row.map((cell) => cleanFreeText(cell, config)))
    .filter((row) => row.some(Boolean));

const createBlockId = (index: number) => `block-${index + 1}`;

@Injectable()
export class DocumentCleanerService {
  clean(
    parsedDocument: ParsedDocument,
    config?: KnowledgeDocumentChunkConfig,
  ): DocumentCleanerResult {
    if (!parsedDocument.blocks.length) {
      throw new BadRequestException("解析结果为空，无法清洗");
    }

    const cleanedBlocks: ParsedDocumentBlock[] = [];
    let removedBlockCount = 0;

    for (const block of parsedDocument.blocks) {
      const rows = cleanTableRows(block.rows, config);
      const text =
        block.type === "table" && rows?.length
          ? rows.map((row) => row.join(" | ")).join("\n")
          : PRESERVE_FORMAT_TYPES.has(block.type)
            ? cleanPreservedText(block.text, config)
            : cleanFreeText(block.text, config);

      if (!text) {
        removedBlockCount += 1;
        continue;
      }

      const previousBlock = cleanedBlocks[cleanedBlocks.length - 1];
      if (
        previousBlock?.type === block.type &&
        previousBlock.text === text &&
        previousBlock.page === block.page
      ) {
        removedBlockCount += 1;
        continue;
      }

      cleanedBlocks.push({
        ...block,
        id: createBlockId(cleanedBlocks.length),
        text,
        ...(block.type === "table"
          ? {
              rows: rows ?? [],
              metadata: {
                ...block.metadata,
                rows: rows?.length ?? 0,
                columns: rows?.[0]?.length ?? 0,
              },
            }
          : {}),
        headingPath: block.headingPath
          ?.map((heading) => cleanFreeText(heading, config))
          .filter(Boolean),
      });
    }

    const text = blocksToText(cleanedBlocks);
    const document: CleanedDocument = {
      ...parsedDocument,
      text,
      characterCount: text.length,
      blocks: cleanedBlocks,
      metadata: {
        ...parsedDocument.metadata,
        blockCount: cleanedBlocks.length,
        cleaner: "basic",
        removedBlockCount,
        originalCharacterCount: parsedDocument.characterCount,
        rules: RULES,
      },
    };

    return { document };
  }
}
