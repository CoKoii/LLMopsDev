import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ParsedDocument,
  ParsedDocumentBlock,
} from "../document-parser/document-parser.types";
import { blocksToText, normalizeText } from "../document-parser/parsers/parser.utils";
import type { CleanedDocument, DocumentCleanerResult } from "./document-cleaner.types";

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

const removeControlCharacters = (value: string) =>
  value
    .replace(/\u0000/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

const isPageMarkLine = (value: string) => {
  const text = value.trim();
  return PAGE_MARK_PATTERNS.some((pattern) => pattern.test(text));
};

const cleanFreeText = (value: string) =>
  removeControlCharacters(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((line) => line && !isPageMarkLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const cleanPreservedText = (value: string) =>
  normalizeText(removeControlCharacters(value)).replace(/\n{4,}/g, "\n\n\n");

const cleanTableRows = (rows?: string[][]) =>
  rows
    ?.map((row) => row.map((cell) => cleanFreeText(cell)))
    .filter((row) => row.some(Boolean));

const createBlockId = (index: number) => `block-${index + 1}`;

@Injectable()
export class DocumentCleanerService {
  clean(parsedDocument: ParsedDocument): DocumentCleanerResult {
    if (!parsedDocument.blocks.length) {
      throw new BadRequestException("解析结果为空，无法清洗");
    }

    const cleanedBlocks: ParsedDocumentBlock[] = [];
    let removedBlockCount = 0;

    for (const block of parsedDocument.blocks) {
      const rows = cleanTableRows(block.rows);
      const text =
        block.type === "table" && rows?.length
          ? rows.map((row) => row.join(" | ")).join("\n")
          : PRESERVE_FORMAT_TYPES.has(block.type)
            ? cleanPreservedText(block.text)
            : cleanFreeText(block.text);

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
        headingPath: block.headingPath?.map(cleanFreeText).filter(Boolean),
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
