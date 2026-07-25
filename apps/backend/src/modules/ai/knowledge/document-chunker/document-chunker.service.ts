import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ParsedDocumentBlock,
  ParsedDocumentBlockType,
} from "../document-parser/document-parser.types";
import { extractChunkKeywords } from "../document-keyword-extractor";
import type { KnowledgeDocumentChunkConfig } from "../knowledge-document-process.types";
import type {
  DocumentChunkDraft,
  DocumentChunkerInput,
  DocumentChunkMetadata,
} from "./document-chunker.types";

interface ParagraphUnit {
  text: string;
  headingPath: string[];
  sourceBlockIds: string[];
  blockTypes: ParsedDocumentBlockType[];
  pages: number[];
  tokenCount: number;
  breakBefore?: boolean;
}

interface ChunkGroup {
  units: ParagraphUnit[];
}

const DEFAULT_MAX_TOKENS = 700;
const MIN_CHUNK_TOKENS = 160;
const OVERLAP_TOKENS = 80;

const unique = <T>(items: T[]) => Array.from(new Set(items));

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const estimateTokens = (text: string) => {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9_./:-]+/g)?.length ?? 0;
  const other = Math.max(0, text.length - cjkCount);
  return Math.max(1, Math.ceil(cjkCount + words * 1.25 + other * 0.08));
};

const collectHeadingPath = (
  currentHeadingPath: string[],
  block: ParsedDocumentBlock,
) => {
  if (block.type !== "heading") return currentHeadingPath;

  const level = Math.max(1, block.level ?? currentHeadingPath.length + 1);
  return [
    ...currentHeadingPath.slice(0, level - 1),
    compact(block.text),
  ].filter(Boolean);
};

const resolveBlockHeadingPath = (
  currentHeadingPath: string[],
  block: ParsedDocumentBlock,
  fallbackHeadingPath = currentHeadingPath,
) => {
  const headingPath = block.headingPath?.map(compact).filter(Boolean) ?? [];
  if (headingPath.length) return headingPath;

  return block.type === "heading"
    ? collectHeadingPath(currentHeadingPath, block)
    : fallbackHeadingPath;
};

const blockToUnit = (
  block: ParsedDocumentBlock,
  headingPath: string[],
): ParagraphUnit | undefined => {
  const text = compact(block.text);
  if (!text) return undefined;

  return {
    text,
    headingPath,
    sourceBlockIds: [block.id],
    blockTypes: [block.type],
    pages: typeof block.page === "number" ? [block.page] : [],
    tokenCount: estimateTokens(text),
  };
};

const commonHeadingPath = (units: ParagraphUnit[]) => {
  const firstPath = units[0]?.headingPath ?? [];
  return firstPath.filter((heading, index) =>
    units.every((unit) => unit.headingPath[index] === heading),
  );
};

const sameHeadingRoot = (left: string[], right: string[]) =>
  Boolean(left[0] && right[0] && left[0] === right[0]);

const mergeUnits = (units: ParagraphUnit[]): ParagraphUnit => {
  const text = units.map((unit) => unit.text).join("\n\n");
  return {
    text,
    headingPath: commonHeadingPath(units),
    sourceBlockIds: units.flatMap((unit) => unit.sourceBlockIds),
    blockTypes: unique(units.flatMap((unit) => unit.blockTypes)),
    pages: unique(units.flatMap((unit) => unit.pages)).sort((a, b) => a - b),
    tokenCount: estimateTokens(text),
  };
};

const resolveMaxTokens = (config?: KnowledgeDocumentChunkConfig) =>
  typeof config?.maxSegmentLength === "number" &&
  Number.isFinite(config.maxSegmentLength)
    ? Math.max(100, Math.min(config.maxSegmentLength, 10000))
    : DEFAULT_MAX_TOKENS;

const resolveSeparators = (config?: KnowledgeDocumentChunkConfig) =>
  (config?.separator ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const splitUnitBySeparators = (
  unit: ParagraphUnit,
  separators: string[],
): ParagraphUnit[] => {
  if (!separators.length) return [unit];

  const separatorPattern = new RegExp(
    separators.map(escapeRegExp).join("|"),
    "g",
  );
  return unit.text.split(separatorPattern).flatMap((value, index) => {
    const text = compact(value);
    if (!text) return [];

    return {
      ...unit,
      text,
      tokenCount: estimateTokens(text),
      breakBefore: index > 0,
    };
  });
};

const splitByCharacterLimit = (
  unit: ParagraphUnit,
  maxTokens: number,
): ParagraphUnit[] => {
  if (unit.tokenCount <= maxTokens) return [unit];

  const chunks: ParagraphUnit[] = [];
  const maxCharacters = Math.max(1, maxTokens);

  for (let start = 0; start < unit.text.length; start += maxCharacters) {
    const text = compact(unit.text.slice(start, start + maxCharacters));
    if (!text) continue;

    chunks.push({
      ...unit,
      text,
      tokenCount: estimateTokens(text),
      breakBefore: chunks.length > 0 || unit.breakBefore,
    });
  }

  return chunks;
};

const splitOversizedUnit = (
  unit: ParagraphUnit,
  maxTokens: number,
): ParagraphUnit[] => {
  if (unit.tokenCount <= maxTokens) return [unit];

  const parts = unit.text
    .split(/(?<=[。！？.!?])\s+|\n+/u)
    .map(compact)
    .filter(Boolean);
  if (parts.length <= 1) return splitByCharacterLimit(unit, maxTokens);

  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current}\n${part}` : part;
    if (estimateTokens(next) > maxTokens && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((text, index) =>
    splitByCharacterLimit(
      {
        ...unit,
        text,
        tokenCount: estimateTokens(text),
        breakBefore: index > 0 || unit.breakBefore,
      },
      maxTokens,
    ),
  );
};

const overlapTail = (text: string) => {
  const normalized = compact(text);
  if (estimateTokens(normalized) <= OVERLAP_TOKENS) return normalized;

  const approximateCharacters = OVERLAP_TOKENS * 2;
  const tail = normalized.slice(
    Math.max(0, normalized.length - approximateCharacters),
  );
  const sentenceStart = tail.search(/[。！？.!?]\s*/u);
  return sentenceStart >= 0
    ? tail.slice(sentenceStart).replace(/^[。！？.!?]\s*/u, "")
    : tail;
};

const chunkPrelude = (headingPath: string[]) =>
  headingPath.length ? `章节：${headingPath.join(" / ")}` : "";

const chunkEmbeddingText = (
  documentTitle: string,
  headingPath: string[],
  overlap: string,
  text: string,
) =>
  [
    `文档：${documentTitle}`,
    headingPath.length ? `章节：${headingPath.join(" / ")}` : undefined,
    overlap ? `上文：${overlap}` : undefined,
    text,
  ]
    .filter(Boolean)
    .join("\n\n");

@Injectable()
export class DocumentChunkerService {
  createChunks(input: DocumentChunkerInput): DocumentChunkDraft[] {
    const maxTokens = resolveMaxTokens(input.chunkConfig);
    const separators = resolveSeparators(input.chunkConfig);
    const units = this.createParagraphUnits(input.document.blocks, separators);
    if (!units.length) {
      throw new BadRequestException("增强结果为空，无法切块");
    }

    const chunkGroups = this.createChunkGroups(units, maxTokens);
    const limitedGroups = chunkGroups.flatMap((group) =>
      splitOversizedUnit(mergeUnits(group.units), maxTokens).map((unit) => ({
        units: [unit],
      })),
    );

    return this.createFinalChunks(input, limitedGroups);
  }

  private createParagraphUnits(
    blocks: ParsedDocumentBlock[],
    separators: string[],
  ) {
    let headingPath: string[] = [];
    const units: ParagraphUnit[] = [];

    for (const block of blocks) {
      if (block.type === "heading") {
        headingPath = resolveBlockHeadingPath(headingPath, block);
        const unit = blockToUnit(block, headingPath);
        if (unit) units.push(unit);
        continue;
      }

      const unit = blockToUnit(
        block,
        resolveBlockHeadingPath(headingPath, block),
      );
      if (unit) units.push(...splitUnitBySeparators(unit, separators));
    }

    return units;
  }

  private createChunkGroups(
    units: ParagraphUnit[],
    maxTokens: number,
  ): ChunkGroup[] {
    const groups: ChunkGroup[] = [];
    let current: ParagraphUnit[] = [];

    for (const unit of units) {
      if (!current.length) {
        current = [unit];
        continue;
      }

      const previous = current[current.length - 1];
      const sameSection =
        previous?.headingPath.join("\n") === unit.headingPath.join("\n");
      const sameRootSection = sameHeadingRoot(
        previous?.headingPath ?? [],
        unit.headingPath,
      );
      const currentTokenCount = current.reduce(
        (total, item) => total + item.tokenCount,
        0,
      );
      const mergedTokenCount = currentTokenCount + unit.tokenCount;
      const shouldMerge =
        !unit.breakBefore &&
        (sameSection ||
          (sameRootSection && currentTokenCount < MIN_CHUNK_TOKENS)) &&
        mergedTokenCount <= maxTokens;

      if (shouldMerge) {
        current.push(unit);
      } else {
        groups.push({ units: current });
        current = [unit];
      }
    }

    if (current.length) groups.push({ units: current });
    return groups;
  }

  private createFinalChunks(
    input: DocumentChunkerInput,
    groups: ChunkGroup[],
  ): DocumentChunkDraft[] {
    const chunks: DocumentChunkDraft[] = [];

    for (const group of groups) {
      const merged = mergeUnits(group.units);
      const previousText = chunks[chunks.length - 1]?.text;
      const overlap = previousText ? overlapTail(previousText) : "";
      const text = merged.text;
      const prelude = chunkPrelude(merged.headingPath);
      const embeddingText = chunkEmbeddingText(
        input.document.title,
        merged.headingPath,
        overlap,
        text,
      );
      const searchText = [
        prelude,
        overlap ? `上文：${overlap}` : undefined,
        text,
      ]
        .filter(Boolean)
        .join("\n\n");
      const chunkIndex = chunks.length;
      const keywords = extractChunkKeywords(text, merged.headingPath);
      const metadata: DocumentChunkMetadata = {
        knowledgeId: input.knowledgeId,
        documentId: input.documentId,
        documentName: input.documentName,
        documentTitle: input.document.title,
        contentType: input.contentType,
        format: input.document.format,
        chunkIndex,
        sectionTitle: merged.headingPath[merged.headingPath.length - 1],
        headingPath: merged.headingPath,
        sourceBlockIds: merged.sourceBlockIds,
        blockTypes: merged.blockTypes,
        pages: merged.pages,
        tokenCount: estimateTokens(text),
        characterCount: text.length,
        overlapFromPrevious: Boolean(overlap),
        keywords,
      };

      chunks.push({
        chunkIndex,
        text,
        searchText,
        embeddingText,
        tokenCount: metadata.tokenCount,
        characterCount: metadata.characterCount,
        metadata,
      });
    }

    return chunks;
  }
}
