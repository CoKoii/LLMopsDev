import WordExtractor from "word-extractor";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import { createParagraphBlocks, getExtension } from "./parser.utils";

export class DocDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return getExtension(input.filename) === "doc";
  }

  async parse(input: DocumentParserInput) {
    const document = await new WordExtractor().extract(input.buffer);

    return {
      format: "doc",
      parser: "word-extractor",
      blocks: createParagraphBlocks(document.getBody()),
    };
  }
}
