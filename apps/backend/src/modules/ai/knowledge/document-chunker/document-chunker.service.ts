import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ParsedDocumentBlock,
  ParsedDocumentBlockType,
} from "../document-parser/document-parser.types";
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
}

interface ChunkGroup {
  units: ParagraphUnit[];
}

const MAX_TOKENS = 700;
const OVERLAP_TOKENS = 80;

const unique = <T>(items: T[]) => Array.from(new Set(items));

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

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

const blockToUnit = (
  block: ParsedDocumentBlock,
  headingPath: string[],
): ParagraphUnit | undefined => {
  const text = compact(block.text);
  if (!text || block.type === "heading") return undefined;

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

const splitOversizedUnit = (unit: ParagraphUnit): ParagraphUnit[] => {
  if (unit.tokenCount <= MAX_TOKENS) return [unit];

  const parts = unit.text
    .split(/(?<=[。！？.!?])\s+|\n+/u)
    .map(compact)
    .filter(Boolean);
  if (parts.length <= 1) return [unit];

  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current}\n${part}` : part;
    if (estimateTokens(next) > MAX_TOKENS && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((text) => ({
    ...unit,
    text,
    tokenCount: estimateTokens(text),
  }));
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

const chunkPrelude = (input: DocumentChunkerInput, headingPath: string[]) =>
  [
    `文档：${input.document.title || input.documentName}`,
    input.summary ? `摘要：${input.summary}` : undefined,
    input.keywords?.length ? `关键词：${input.keywords.join("、")}` : undefined,
    headingPath.length ? `章节：${headingPath.join(" / ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

const chunkEmbeddingText = (
  input: DocumentChunkerInput,
  headingPath: string[],
  text: string,
) =>
  [
    `文档：${input.document.title || input.documentName}`,
    headingPath.length ? `章节：${headingPath.join(" / ")}` : undefined,
    text,
  ]
    .filter(Boolean)
    .join("\n\n");

@Injectable()
export class DocumentChunkerService {
  async createChunks(
    input: DocumentChunkerInput,
  ): Promise<DocumentChunkDraft[]> {
    const units = this.createParagraphUnits(input.document.blocks);
    if (!units.length) {
      throw new BadRequestException("增强结果为空，无法切块");
    }

    const chunkGroups = this.createChunkGroups(units);
    const limitedGroups = chunkGroups.flatMap((group) =>
      splitOversizedUnit(mergeUnits(group.units)).map((unit) => ({
        units: [unit],
      })),
    );

    return this.createFinalChunks(input, limitedGroups);
  }

  private createParagraphUnits(blocks: ParsedDocumentBlock[]) {
    let headingPath: string[] = [];
    const units: ParagraphUnit[] = [];

    for (const block of blocks) {
      if (block.type === "heading") {
        headingPath = collectHeadingPath(headingPath, block);
        continue;
      }

      const unit = blockToUnit(block, block.headingPath ?? headingPath);
      if (unit) units.push(unit);
    }

    return units;
  }

  private createChunkGroups(units: ParagraphUnit[]): ChunkGroup[] {
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
      const mergedTokenCount =
        current.reduce((total, item) => total + item.tokenCount, 0) +
        unit.tokenCount;
      const shouldMerge = sameSection && mergedTokenCount <= MAX_TOKENS;

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
      const prelude = chunkPrelude(input, merged.headingPath);
      const embeddingText = chunkEmbeddingText(input, merged.headingPath, text);
      const searchText = [
        prelude,
        overlap ? `上文：${overlap}` : undefined,
        text,
      ]
        .filter(Boolean)
        .join("\n\n");
      const chunkIndex = chunks.length;
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
        summary: input.summary,
        keywords: input.keywords ?? [],
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
