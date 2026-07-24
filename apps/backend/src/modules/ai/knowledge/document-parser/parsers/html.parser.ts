import * as cheerio from "cheerio";
import type {
  DocumentFormatParser,
  DocumentParserInput,
  ParsedDocumentBlock,
} from "../document-parser.types";
import {
  createBlockBuilder,
  createParagraphBlocks,
  createTableText,
  getExtension,
  isContentType,
} from "./parser.utils";

const HTML_EXTENSIONS = new Set(["html", "htm"]);

export const parseHtmlBlocks = (html: string): ParsedDocumentBlock[] => {
  const $ = cheerio.load(html);
  const builder = createBlockBuilder();

  $("script, style, noscript").remove();
  $("h1,h2,h3,h4,h5,h6,p,li,pre,table").each((_, element) => {
    const item = $(element);
    const tagName = element.tagName.toLowerCase();

    if (tagName !== "table" && item.parents("table").length) return;

    if (tagName === "table") {
      const rows = item
        .find("tr")
        .toArray()
        .map((row) =>
          $(row)
            .find("th,td")
            .toArray()
            .map((cell) => $(cell).text().trim()),
        )
        .filter((row) => row.some(Boolean));

      if (rows.length) {
        builder.add("table", createTableText(rows), {
          rows,
          metadata: {
            rows: rows.length,
            columns: rows[0]?.length ?? 0,
          },
        });
      }
      return;
    }

    const text = item.text().trim();
    if (!text) return;

    if (/^h[1-6]$/.test(tagName)) {
      builder.add("heading", text, { level: Number(tagName.slice(1)) });
      return;
    }

    if (tagName === "li") {
      builder.add("list", text);
      return;
    }

    if (tagName === "pre") {
      builder.add("code", text);
      return;
    }

    builder.add("paragraph", text);
  });

  return builder.blocks.length
    ? builder.blocks
    : createParagraphBlocks($.text());
};

export class HtmlDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    const extension = getExtension(input.filename);
    return HTML_EXTENSIONS.has(extension) || isContentType(input, "html");
  }

  parse(input: DocumentParserInput) {
    return {
      format: "html",
      parser: "cheerio",
      blocks: parseHtmlBlocks(input.buffer.toString("utf8")),
    };
  }
}
