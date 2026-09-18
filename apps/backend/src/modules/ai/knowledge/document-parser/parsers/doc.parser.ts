import WordExtractor from "word-extractor";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  getExtension,
  normalizeText,
} from "./parser.utils";

const MAX_HEADING_LENGTH = 60;
const MAX_TOC_LINE_LENGTH = 100;

const TOC_DOTTED_LINE = /\.{3,}/;
// word-extractor 输出的目录行页码前通常只有一个 tab/空格（如“第一章 绪论\t8”）
const TOC_PAGE_NUMBER = /\s+\d{1,3}\s*$/;

const CHAPTER_HEADING = /^第\s*[一二三四五六七八九十百0-9]+\s*章/;
const SECTION_HEADING = /^(\d{1,2})(\.\d{1,2}){1,3}\s+/;
const NAMED_HEADING =
  /^(摘\s*要|Abstract|前\s*言|绪\s*论|引\s*言|结\s*论|参考文献|致\s*谢|附\s*录)(?=$|[\s:：])/;

const TOC_TITLE = /^目\s*录$/;

// 老版 .doc 没有可读的样式信息，word-extractor 只输出纯文本。
// 这里用启发式规则恢复论文/报告类文档的标题层级，并剔除目录页（点线+页码）条目。
const isTocEntry = (text: string) => {
  if (text.length > MAX_TOC_LINE_LENGTH) return false;
  if (TOC_DOTTED_LINE.test(text)) return true;
  return (
    TOC_PAGE_NUMBER.test(text) &&
    (CHAPTER_HEADING.test(text) ||
      SECTION_HEADING.test(text) ||
      NAMED_HEADING.test(text))
  );
};

const isHeadingText = (text: string) => {
  if (text.length > MAX_HEADING_LENGTH) return false;
  // 标题不以句末标点结尾；英文点号不拦截（小节号 1.1 / 3.1.1 合法）
  if (/[。！？；;，,]$/.test(text)) return false;
  return (
    CHAPTER_HEADING.test(text) ||
    SECTION_HEADING.test(text) ||
    NAMED_HEADING.test(text)
  );
};

const resolveHeadingLevel = (text: string) => {
  if (CHAPTER_HEADING.test(text) || NAMED_HEADING.test(text)) return 1;
  const match = SECTION_HEADING.exec(text);
  if (!match) return 1;
  return Math.min(3, match[0].trim().split(".").length);
};

const createDocBlocks = (body: string) => {
  const builder = createBlockBuilder();
  let skippedTocCount = 0;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join("\n").trim();
    paragraphLines = [];
    if (text) builder.add("paragraph", text);
  };

  for (const line of normalizeText(body).split("\n")) {
    const text = line.trim();
    if (!text) {
      flushParagraph();
      continue;
    }
    // 目录页条目以单换行相连，逐行剔除，避免整页目录进入正文分块
    if (TOC_TITLE.test(text) || isTocEntry(text)) {
      skippedTocCount += 1;
      continue;
    }
    if (isHeadingText(text)) {
      flushParagraph();
      builder.add("heading", text, { level: resolveHeadingLevel(text) });
      continue;
    }
    paragraphLines.push(text);
  }
  flushParagraph();

  return { blocks: builder.blocks, skippedTocCount };
};

export class DocDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return getExtension(input.filename) === "doc";
  }

  async parse(input: DocumentParserInput) {
    const document = await new WordExtractor().extract(input.buffer);
    const { blocks, skippedTocCount } = createDocBlocks(document.getBody());

    if (!blocks.length) {
      return {
        format: "doc",
        parser: "word-extractor",
        blocks,
        warnings: ["老版 .doc 未能解析出有效正文，请转换为 .docx 后重新上传"],
      };
    }

    return {
      format: "doc",
      parser: "word-extractor",
      blocks,
      warnings: [
        "老版 .doc 格式仅解析正文文本；如需解析内嵌图片，请转换为 .docx 后上传",
        ...(skippedTocCount > 0
          ? [`已剔除目录页条目 ${skippedTocCount} 条`]
          : []),
      ],
    };
  }
}
