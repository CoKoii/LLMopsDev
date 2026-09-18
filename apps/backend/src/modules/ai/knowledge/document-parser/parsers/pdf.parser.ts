import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  DocumentFormatParser,
  DocumentParserInput,
  ParsedDocumentBlockType,
} from "../document-parser.types";
import {
  createBlockBuilder,
  getExtension,
  isContentType,
} from "./parser.utils";

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PdfTextLine {
  text: string;
  page: number;
  x: number;
  y: number;
  right: number;
  fontSize: number;
  pageLeft: number;
  pageRight: number;
}

interface PendingBlock {
  type: ParsedDocumentBlockType;
  text: string;
  page: number;
  lineCount: number;
  right: number;
  pageRight: number;
}

const LINE_Y_TOLERANCE = 4;
const LIST_INDENT = 12;
const RIGHT_EDGE_TOLERANCE = 40;

const compactInline = (value: string) => value.replace(/\s+/g, " ").trim();

const isPdfTextItem = (value: unknown): value is PdfTextItem => {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<PdfTextItem>;
  return (
    typeof item.str === "string" &&
    Array.isArray(item.transform) &&
    typeof item.width === "number" &&
    typeof item.height === "number"
  );
};

const resolveFontSize = (item: PdfTextItem) => {
  const [, b = 0, , d = 0] = item.transform;
  return Math.max(1, Math.hypot(b, d), item.height || 0);
};

const median = (values: number[]) => {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const createLineText = (items: PdfTextItem[]) => {
  let text = "";
  let previous: PdfTextItem | undefined;

  for (const item of items) {
    const value = compactInline(item.str);
    if (!value) continue;

    if (previous) {
      const previousRight = previous.transform[4] + previous.width;
      const gap = item.transform[4] - previousRight;
      if (gap > 2 && text && !text.endsWith(" ")) text += " ";
    }

    text += value;
    previous = item;
  }

  return compactInline(text);
};

const extractLines = async (input: DocumentParserInput) => {
  const loadingTask = getDocument({
    data: new Uint8Array(input.buffer),
    disableWorker: true,
  } as Parameters<typeof getDocument>[0]);
  const document = await loadingTask.promise;

  try {
    const lines: PdfTextLine[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({
        disableNormalization: false,
      });
      const items = (content.items as unknown[])
        .filter(isPdfTextItem)
        .filter((item) => item.str.trim())
        .sort(
          (left, right) =>
            right.transform[5] - left.transform[5] ||
            left.transform[4] - right.transform[4],
        );

      if (!items.length) continue;

      const pageLeft = Math.min(...items.map((item) => item.transform[4]));
      const pageRight = Math.max(
        ...items.map((item) => item.transform[4] + item.width),
      );
      const groupedLines: PdfTextItem[][] = [];

      for (const item of items) {
        const y = item.transform[5];
        const line = groupedLines.find(
          (group) => Math.abs(group[0].transform[5] - y) <= LINE_Y_TOLERANCE,
        );

        if (line) {
          line.push(item);
        } else {
          groupedLines.push([item]);
        }
      }

      for (const group of groupedLines) {
        group.sort((left, right) => left.transform[4] - right.transform[4]);
        const text = createLineText(group);
        if (!text) continue;

        const x = Math.min(...group.map((item) => item.transform[4]));
        const right = Math.max(
          ...group.map((item) => item.transform[4] + item.width),
        );
        lines.push({
          text,
          page: pageNumber,
          x,
          y: median(group.map((item) => item.transform[5])),
          right,
          fontSize: Math.max(...group.map(resolveFontSize)),
          pageLeft,
          pageRight,
        });
      }
    }

    return lines.sort(
      (left, right) =>
        left.page - right.page || right.y - left.y || left.x - right.x,
    );
  } finally {
    await loadingTask.destroy();
  }
};

const isSectionHeadingText = (text: string) =>
  /^[\p{Script=Han}A-Za-z0-9 /｜|()（）-]{2,24}$/u.test(text) &&
  /(经历|技能|简介|概况|背景|职责|优势|项目|教育|工作|证书|荣誉)$/.test(text);

const isLabelLine = (text: string) =>
  /^[^\s:：，。；;,.!?！？、]{2,16}[:：]/u.test(text);

const isLikelyHeading = (line: PdfTextLine, bodyFontSize: number) => {
  const text = line.text;
  const leftAligned = line.x <= line.pageLeft + 8;
  const prominent = line.fontSize >= bodyFontSize * 1.1;

  if (line.fontSize >= bodyFontSize * 1.35 && text.length <= 40) {
    return true;
  }

  return leftAligned && prominent && text.length <= 90 && !text.endsWith("：");
};

const resolveHeadingLevel = (line: PdfTextLine, bodyFontSize: number) => {
  if (line.fontSize >= bodyFontSize * 1.35 || isSectionHeadingText(line.text)) {
    return 1;
  }

  return 2;
};

const isListLine = (line: PdfTextLine) =>
  /^[\-*•·●○]\s*/u.test(line.text) || line.x >= line.pageLeft + LIST_INDENT;

const startsExplicitListItem = (text: string) =>
  /^[\-*•·●○]\s+|^\d+[.)、]\s+/u.test(text) || isLabelLine(text);

const shouldAppendWrappedLine = (
  pending: PendingBlock | undefined,
  line: PdfTextLine,
) => {
  if (!pending || pending.type !== "list") return false;
  if (startsExplicitListItem(line.text)) return false;

  return (
    pending.right >= pending.pageRight - RIGHT_EDGE_TOLERANCE &&
    line.text.length <= 28
  );
};

const shouldJoinWithoutSpace = (left: string, right: string) =>
  /[\p{Script=Han}（(]$/u.test(left) ||
  /^[\p{Script=Han}）)，。！？、；：]/u.test(right);

const joinWrappedText = (left: string, right: string) =>
  shouldJoinWithoutSpace(left.trimEnd(), right.trimStart())
    ? `${left.trimEnd()}${right.trimStart()}`
    : `${left.trimEnd()} ${right.trimStart()}`;

const appendBlockLine = (
  pending: PendingBlock,
  line: Pick<PdfTextLine, "text" | "right">,
) => ({
  ...pending,
  text: joinWrappedText(pending.text, line.text),
  lineCount: pending.lineCount + 1,
  right: line.right,
});

export class PdfDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return (
      getExtension(input.filename) === "pdf" || isContentType(input, "pdf")
    );
  }

  async parse(input: DocumentParserInput) {
    const lines = await extractLines(input);
    const builder = createBlockBuilder();
    const bodyFontSize = median(lines.map((line) => line.fontSize)) || 11;
    let pending: PendingBlock | undefined;

    const flushPending = () => {
      if (!pending) return;

      builder.add(pending.type, pending.text, {
        page: pending.page,
        metadata: { lineCount: pending.lineCount },
      });
      pending = undefined;
    };

    for (const line of lines) {
      if (isLikelyHeading(line, bodyFontSize)) {
        flushPending();
        builder.add("heading", line.text, {
          level: resolveHeadingLevel(line, bodyFontSize),
          page: line.page,
          metadata: {
            fontSize: Math.round(line.fontSize),
            layoutRole: "heading",
          },
        });
        continue;
      }

      if (isListLine(line)) {
        if (pending && shouldAppendWrappedLine(pending, line)) {
          pending = appendBlockLine(pending, line);
          continue;
        }

        flushPending();
        pending = {
          type: "list",
          text: line.text,
          page: line.page,
          lineCount: 1,
          right: line.right,
          pageRight: line.pageRight,
        };
        continue;
      }

      if (
        pending?.type === "paragraph" &&
        pending.page === line.page &&
        !startsExplicitListItem(line.text)
      ) {
        const text =
          pending.right >= pending.pageRight - RIGHT_EDGE_TOLERANCE
            ? joinWrappedText(pending.text, line.text)
            : `${pending.text}\n${line.text}`;
        pending = {
          ...pending,
          text,
          lineCount: pending.lineCount + 1,
          right: line.right,
        };
      } else {
        flushPending();
        pending = {
          type: "paragraph",
          text: line.text,
          page: line.page,
          lineCount: 1,
          right: line.right,
          pageRight: line.pageRight,
        };
      }
    }

    flushPending();

    return {
      format: "pdf",
      parser: "pdfjs-dist-layout",
      blocks: builder.blocks,
      warnings: builder.blocks.length
        ? undefined
        : ["未解析到文本，可能是扫描版 PDF"],
    };
  }
}
