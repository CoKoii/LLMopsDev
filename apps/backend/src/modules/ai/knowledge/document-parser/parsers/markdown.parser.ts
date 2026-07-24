import { marked, type Token, type Tokens } from "marked";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  createTableText,
  extractEndpoint,
  getExtension,
  isContentType,
  normalizeText,
} from "./parser.utils";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

const stripFrontmatter = (source: string) => {
  const normalized = source.replace(/^\ufeff/, "");
  const match = /^(---|\+\+\+)\s*\n[\s\S]*?\n\1\s*(?:\n|$)/.exec(normalized);
  return match ? normalized.slice(match[0].length) : normalized;
};

const isToken = <T extends Token["type"]>(
  token: Token,
  type: T,
): token is Extract<Token, { type: T }> => token.type === type;

const renderInlineText = (tokens?: Token[]) =>
  tokens
    ?.map((token) => {
      if ("text" in token && typeof token.text === "string") return token.text;
      if ("raw" in token && typeof token.raw === "string") return token.raw;
      return "";
    })
    .join("")
    .trim() ?? "";

const tableCellText = (cell: Tokens.TableCell) =>
  renderInlineText(cell.tokens) || cell.text;

export class MarkdownDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    const extension = getExtension(input.filename);
    return (
      MARKDOWN_EXTENSIONS.has(extension) || isContentType(input, "markdown")
    );
  }

  parse(input: DocumentParserInput) {
    const source = stripFrontmatter(input.buffer.toString("utf8"));
    const tokens = marked.lexer(source, { gfm: true });
    const builder = createBlockBuilder();

    for (const token of tokens) {
      if (isToken(token, "space") || isToken(token, "hr")) continue;

      if (isToken(token, "heading")) {
        builder.add("heading", token.text, { level: token.depth });
        continue;
      }

      if (isToken(token, "code")) {
        const endpoint = extractEndpoint(token.text);
        builder.add("code", token.text, {
          language: token.lang,
          metadata: {
            ...(endpoint ?? {}),
            rawFence: token.raw.split("\n")[0] ?? "",
          },
        });
        continue;
      }

      if (isToken(token, "table")) {
        const rows = [
          token.header.map(tableCellText),
          ...token.rows.map((row) => row.map(tableCellText)),
        ];
        builder.add("table", createTableText(rows), {
          rows,
          metadata: {
            rows: rows.length,
            columns: rows[0]?.length ?? 0,
            align: token.align.map((item) => item ?? "left"),
          },
        });
        continue;
      }

      if (isToken(token, "list")) {
        token.items.forEach((item, index) => {
          const text = normalizeText(item.text);
          builder.add(
            "list",
            token.ordered
              ? `${Number(token.start || 1) + index}. ${text}`
              : `- ${text}`,
            {
              metadata: {
                ordered: token.ordered,
                task: item.task,
                checked: item.checked ?? null,
              },
            },
          );
        });
        continue;
      }

      if (isToken(token, "paragraph") || isToken(token, "text")) {
        const text = renderInlineText(token.tokens) || token.text;
        builder.add("paragraph", text);
        continue;
      }

      if (isToken(token, "html")) {
        builder.add("paragraph", token.text);
        continue;
      }

      if ("raw" in token && typeof token.raw === "string") {
        builder.add("paragraph", token.raw);
      }
    }

    return {
      format: "md",
      parser: "marked",
      blocks: builder.blocks,
    };
  }
}
