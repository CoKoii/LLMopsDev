import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import { createParagraphBlocks, getExtension } from "./parser.utils";

const TEXT_EXTENSIONS = new Set(["txt", "log"]);

export class TextDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return TEXT_EXTENSIONS.has(getExtension(input.filename));
  }

  parse(input: DocumentParserInput) {
    return {
      format: getExtension(input.filename) || "txt",
      parser: "text",
      blocks: createParagraphBlocks(input.buffer.toString("utf8")),
    };
  }
}
