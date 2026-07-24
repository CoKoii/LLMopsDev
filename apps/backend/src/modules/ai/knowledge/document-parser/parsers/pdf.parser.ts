import { PDFParse } from "pdf-parse";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  getExtension,
  isContentType,
} from "./parser.utils";

export class PdfDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return (
      getExtension(input.filename) === "pdf" || isContentType(input, "pdf")
    );
  }

  async parse(input: DocumentParserInput) {
    const parser = new PDFParse({ data: input.buffer });

    try {
      const result = await parser.getText();
      const builder = createBlockBuilder();

      for (const page of result.pages) {
        page.text
          .split(/\n{2,}/)
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) =>
            builder.add("paragraph", item, {
              page: page.num,
              metadata: { pages: result.total },
            }),
          );
      }

      return {
        format: "pdf",
        parser: "pdf-parse",
        blocks: builder.blocks,
        warnings: result.text.trim()
          ? undefined
          : ["未解析到文本，可能是扫描版 PDF"],
      };
    } finally {
      await parser.destroy();
    }
  }
}
