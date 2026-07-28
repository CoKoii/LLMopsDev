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
      warnings: ["老版 .doc 格式仅解析正文文本；如需解析内嵌图片，请转换为 .docx 后上传"],
    };
  }
}
