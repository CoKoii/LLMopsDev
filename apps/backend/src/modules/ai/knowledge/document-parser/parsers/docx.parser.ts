import mammoth from "mammoth";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import { getExtension } from "./parser.utils";
import { parseHtmlBlocks } from "./html.parser";

export class DocxDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return getExtension(input.filename) === "docx";
  }

  async parse(input: DocumentParserInput) {
    const result = await mammoth.convertToHtml({ buffer: input.buffer });

    return {
      format: "docx",
      parser: "mammoth",
      blocks: parseHtmlBlocks(result.value),
      warnings: result.messages.map((item) => item.message).filter(Boolean),
    };
  }
}
