import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ParsedDocumentBlock,
  ParsedDocumentBlockType,
} from "../document-parser/document-parser.types";
import { extractChunkKeywords } from "../document-keyword-extractor";
import type { KnowledgeDocumentChunkConfig } from "../knowledge-document-process.types";
import { estimateTokens } from "../token-estimator";
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
  orderIndex: number;
  breakBefore?: boolean;
}

interface DocumentSection {
  id: string;
  index: number;
  title?: string;
  headingPath: string[];
  units: ParagraphUnit[];
  sourceBlockIds: string[];
  tokenCount: number;
  anchorText: string;
}

interface ChunkGroup {
  section: DocumentSection;
  units: ParagraphUnit[];
  sectionChunkIndex: number;
  sectionChunkCount: number;
}

const DEFAULT_MAX_TOKENS = 700;
const MIN_CHUNK_TOKENS = 160;
const OVERLAP_TOKENS = 80;
const SECTION_SINGLE_CHUNK_MULTIPLIER = 1.45;
const SECTION_CONTEXT_TOKENS = 220;

const PRESERVE_FORMAT_TYPES = new Set<ParsedDocumentBlockType>([
  "code",
  "json",
  "table",
]);

const unique = <T>(items: T[]) => Array.from(new Set(items));

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizePreservedText = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

const normalizeFlowText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(compact)
    .filter(Boolean)
    .join("\n");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const formatCodeText = (block: ParsedDocumentBlock) => {
  const text = normalizePreservedText(block.text);
  if (text.startsWith("```")) return text;

  const language = block.language || (block.type === "json" ? "json" : "");
  return [`\`\`\`${language}`.trimEnd(), text, "```"].join("\n");
};

const normalizeBlockText = (block: ParsedDocumentBlock) => {
  if (block.type === "code" || block.type === "json")
    return formatCodeText(block);
  if (PRESERVE_FORMAT_TYPES.has(block.type)) {
    return normalizePreservedText(block.text);
  }
  return normalizeFlowText(block.text);
};

const blockToUnit = (
  block: ParsedDocumentBlock,
  headingPath: string[],
  orderIndex: number,
): ParagraphUnit | undefined => {
  const text = normalizeBlockText(block);
  if (!text) return undefined;

  return {
    text,
    headingPath,
    sourceBlockIds: [block.id],
    blockTypes: [block.type],
    pages: typeof block.page === "number" ? [block.page] : [],
    tokenCount: estimateTokens(text),
    orderIndex,
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
    orderIndex: Math.min(...units.map((unit) => unit.orderIndex)),
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
  if (
    !separators.length ||
    unit.blockTypes.some((type) => PRESERVE_FORMAT_TYPES.has(type))
  ) {
    return [unit];
  }

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
  const maxCharacters = Math.max(1, maxTokens * 2);
  const preserveFormat = unit.blockTypes.some((type) =>
    PRESERVE_FORMAT_TYPES.has(type),
  );
  let start = 0;

  while (start < unit.text.length) {
    let end = Math.min(unit.text.length, start + maxCharacters);
    while (
      end > start + 1 &&
      estimateTokens(unit.text.slice(start, end)) > maxTokens
    ) {
      end -= Math.max(1, Math.ceil((end - start) / 10));
    }
    if (end <= start) end = start + 1;

    const windowText = unit.text.slice(start, end);
    const breakIndex = Math.max(
      windowText.lastIndexOf("\n"),
      windowText.lastIndexOf("。"),
      windowText.lastIndexOf("！"),
      windowText.lastIndexOf("？"),
      windowText.lastIndexOf(";"),
      windowText.lastIndexOf("；"),
      windowText.lastIndexOf(","),
      windowText.lastIndexOf("，"),
      windowText.lastIndexOf(" "),
    );

    if (breakIndex > Math.floor(windowText.length * 0.5)) {
      end = start + breakIndex + 1;
    }

    const rawText = unit.text.slice(start, end);
    const text = preserveFormat
      ? normalizePreservedText(rawText)
      : normalizeFlowText(rawText);
    start = end;
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

const splitFlowText = (text: string) =>
  normalizeFlowText(text)
    .split(/\n+|(?<=[。！？!?；;])\s*/u)
    .map(compact)
    .filter(Boolean);

const mergeSmallUnits = (
  units: ParagraphUnit[],
  maxTokens: number,
): ParagraphUnit[] => {
  const merged: ParagraphUnit[] = [];

  for (const unit of units) {
    const previous = merged[merged.length - 1];
    const shouldMerge =
      previous &&
      (previous.tokenCount < MIN_CHUNK_TOKENS ||
        unit.tokenCount < MIN_CHUNK_TOKENS) &&
      estimateTokens(`${previous.text}\n${unit.text}`) <= maxTokens;

    if (shouldMerge) {
      merged[merged.length - 1] = {
        ...mergeUnits([previous, unit]),
        breakBefore: previous.breakBefore,
      };
    } else {
      merged.push(unit);
    }
  }

  return merged;
};

const splitPreservedUnit = (
  unit: ParagraphUnit,
  maxTokens: number,
): ParagraphUnit[] => {
  if (unit.tokenCount <= maxTokens) return [unit];

  const chunks: string[] = [];
  let current = "";
  for (const line of unit.text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (estimateTokens(next) > maxTokens && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((text, index) =>
    splitByCharacterLimit(
      {
        ...unit,
        text: normalizePreservedText(text),
        tokenCount: estimateTokens(text),
        breakBefore: index > 0 || unit.breakBefore,
      },
      maxTokens,
    ),
  );
};

const splitOversizedUnit = (
  unit: ParagraphUnit,
  maxTokens: number,
): ParagraphUnit[] => {
  if (unit.tokenCount <= maxTokens) return [unit];
  if (unit.blockTypes.some((type) => PRESERVE_FORMAT_TYPES.has(type))) {
    return splitPreservedUnit(unit, maxTokens);
  }

  const parts = splitFlowText(unit.text);
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

  return mergeSmallUnits(
    chunks.flatMap((text, index) =>
      splitByCharacterLimit(
        {
          ...unit,
          text,
          tokenCount: estimateTokens(text),
          breakBefore: index > 0 || unit.breakBefore,
        },
        maxTokens,
      ),
    ),
    maxTokens,
  );
};

const appendWithinTokenLimit = (
  base: string,
  next: string,
  tokenLimit: number,
) => {
  const candidate = [base, next].filter(Boolean).join("\n\n");
  return estimateTokens(candidate) <= tokenLimit ? candidate : base;
};

const createAnchorText = (headingPath: string[], units: ParagraphUnit[]) => {
  let anchor = headingPath.join(" > ");

  for (const unit of units) {
    if (unit.blockTypes.some((type) => type === "code" || type === "json")) {
      continue;
    }
    const text = compact(unit.text);
    if (!text || headingPath.includes(text)) continue;

    const nextAnchor = appendWithinTokenLimit(
      anchor,
      text,
      SECTION_CONTEXT_TOKENS,
    );
    if (nextAnchor === anchor) break;
    anchor = nextAnchor;
  }

  return anchor.trim();
};

const finalizeSection = (
  section: Omit<
    DocumentSection,
    "anchorText" | "sourceBlockIds" | "tokenCount"
  >,
): DocumentSection => {
  const sourceBlockIds = unique(
    section.units.flatMap((unit) => unit.sourceBlockIds),
  );
  const text = section.units.map((unit) => unit.text).join("\n\n");

  return {
    ...section,
    sourceBlockIds,
    tokenCount: estimateTokens(text),
    anchorText: createAnchorText(section.headingPath, section.units),
  };
};

const isContentHeadingText = (value: string) =>
  /\b(?:19|20)\d{2}[-./年]\d{1,2}\s*[~至-]\s*(?:(?:19|20)\d{2}[-./年]\d{1,2}|至今)\b|https?:\/\/|www\.|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[:：]/.test(
    value,
  );

const isHeadingOnlySection = (section: Pick<DocumentSection, "units">) =>
  section.units.length > 0 &&
  section.units.every((unit) =>
    unit.blockTypes.every((type) => type === "heading"),
  ) &&
  !section.units.some((unit) => isContentHeadingText(unit.text));

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

const uniqueTextParts = (parts: string[]) => {
  const seen = new Set<string>();

  return parts.flatMap((part) => {
    const text = part.trim();
    if (!text) return [];

    const key = compact(text);
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
};

const contextualizeText = (section: DocumentSection, text: string) => {
  const context = section.anchorText;
  if (!context) return text;
  if (compact(text).startsWith(compact(context))) return text;

  return [context, text].join("\n\n");
};

@Injectable()
export class DocumentChunkerService {
  createChunks(input: DocumentChunkerInput): DocumentChunkDraft[] {
    const maxTokens = resolveMaxTokens(input.chunkConfig);
    const separators = resolveSeparators(input.chunkConfig);
    const sections = this.createSections(input.document.blocks, separators);
    if (!sections.length) {
      throw new BadRequestException("增强结果为空，无法切块");
    }

    return this.createFinalChunks(
      input,
      this.createSectionChunkGroups(sections, maxTokens),
    );
  }

  private createSections(
    blocks: ParsedDocumentBlock[],
    separators: string[],
  ): DocumentSection[] {
    let headingPath: string[] = [];
    let nextOrderIndex = 0;
    const sections: DocumentSection[] = [];
    let current: Omit<
      DocumentSection,
      "anchorText" | "sourceBlockIds" | "tokenCount"
    > = {
      id: "section-1",
      index: 0,
      headingPath: [],
      units: [],
    };

    const pushCurrent = () => {
      if (!current.units.length) return;
      if (isHeadingOnlySection(current)) return;
      sections.push(finalizeSection(current));
    };

    const startSection = (nextHeadingPath: string[]) => {
      pushCurrent();
      current = {
        id: `section-${sections.length + 1}`,
        index: sections.length,
        title: nextHeadingPath[nextHeadingPath.length - 1],
        headingPath: nextHeadingPath,
        units: [],
      };
    };

    for (const block of blocks) {
      if (block.type === "heading") {
        headingPath = resolveBlockHeadingPath(headingPath, block);
        startSection(headingPath);
      }

      const unit = blockToUnit(
        block,
        resolveBlockHeadingPath(headingPath, block),
        nextOrderIndex,
      );
      nextOrderIndex += 1;
      if (!unit) continue;

      current.units.push(...splitUnitBySeparators(unit, separators));
    }

    pushCurrent();
    return sections;
  }

  private createSectionChunkGroups(
    sections: DocumentSection[],
    maxTokens: number,
  ): ChunkGroup[] {
    return sections.flatMap((section) => {
      const sectionMaxTokens = Math.floor(
        maxTokens * SECTION_SINGLE_CHUNK_MULTIPLIER,
      );
      const rawGroups =
        section.tokenCount <= sectionMaxTokens
          ? [{ units: section.units }]
          : this.createChunkGroups(section.units, maxTokens).flatMap((group) =>
              splitOversizedUnit(mergeUnits(group.units), maxTokens).map(
                (unit) => ({ units: [unit] }),
              ),
            );

      return rawGroups.map((group, index) => ({
        section,
        units: group.units,
        sectionChunkIndex: index,
        sectionChunkCount: rawGroups.length,
      }));
    });
  }

  private createChunkGroups(
    units: ParagraphUnit[],
    maxTokens: number,
  ): Array<Pick<ChunkGroup, "units">> {
    const groups: Array<Pick<ChunkGroup, "units">> = [];
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
      const contextualized =
        group.sectionChunkCount > 1 || group.section.headingPath.length > 1;
      const text = contextualized
        ? contextualizeText(group.section, merged.text)
        : merged.text;
      const indexText = uniqueTextParts([
        overlap,
        group.section.anchorText,
        text,
      ]).join("\n\n");
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
        sectionId: group.section.id,
        sectionIndex: group.section.index,
        sectionTitle: group.section.title,
        sectionHeadingPath: group.section.headingPath,
        sectionSourceBlockIds: group.section.sourceBlockIds,
        sectionTokenCount: group.section.tokenCount,
        sectionChunkIndex: group.sectionChunkIndex,
        sectionChunkCount: group.sectionChunkCount,
        contextualized,
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
        searchText: indexText,
        embeddingText: indexText,
        tokenCount: metadata.tokenCount,
        characterCount: metadata.characterCount,
        metadata,
      });
    }

    return chunks;
  }
}
