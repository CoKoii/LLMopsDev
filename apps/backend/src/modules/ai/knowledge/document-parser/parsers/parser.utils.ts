import type {
  DocumentParserInput,
  ParsedDocumentBlock,
  ParsedDocumentBlockType,
} from "../document-parser.types";

type BlockExtra = Omit<ParsedDocumentBlock, "id" | "type" | "text">;

export const getExtension = (filename: string) =>
  filename.split(".").pop()?.toLowerCase() ?? "";

export const normalizeText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .trim();

export const isContentType = (input: DocumentParserInput, value: string) =>
  input.contentType.toLowerCase().includes(value);

export const blocksToText = (blocks: ParsedDocumentBlock[]) =>
  blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");

export const createBlockBuilder = () => {
  const blocks: ParsedDocumentBlock[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  const add = (
    type: ParsedDocumentBlockType,
    text: string,
    extra: BlockExtra = {},
  ) => {
    const normalizedText = normalizeText(text);
    if (!normalizedText) return undefined;

    let headingPath = headingStack.map((item) => item.text);

    if (type === "heading" && extra.level) {
      while (
        headingStack.length &&
        headingStack[headingStack.length - 1]!.level >= extra.level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level: extra.level, text: normalizedText });
      headingPath = headingStack.map((item) => item.text);
    }

    const block: ParsedDocumentBlock = {
      id: `block-${blocks.length + 1}`,
      type,
      text: normalizedText,
      ...extra,
      headingPath: extra.headingPath ?? headingPath,
    };

    blocks.push(block);
    return block;
  };

  return {
    add,
    blocks,
    currentHeadingPath: () => headingStack.map((item) => item.text),
  };
};

export const createParagraphBlocks = (text: string) => {
  const builder = createBlockBuilder();

  normalizeText(text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => builder.add("paragraph", item));

  return builder.blocks;
};

export const createTableText = (rows: string[][]) =>
  rows.map((row) => row.map((cell) => cell.trim()).join(" | ")).join("\n");

export const extractEndpoint = (text: string) => {
  const match = /^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)$/m.exec(text.trim());
  if (!match) return undefined;

  return {
    method: match[1]!,
    path: match[2]!,
  };
};
