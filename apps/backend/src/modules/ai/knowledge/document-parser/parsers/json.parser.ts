import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  getExtension,
  isContentType,
} from "./parser.utils";

export class JsonDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return (
      getExtension(input.filename) === "json" || isContentType(input, "json")
    );
  }

  parse(input: DocumentParserInput) {
    const source = input.buffer.toString("utf8");
    const parsed = JSON.parse(source) as unknown;
    const text = JSON.stringify(parsed, null, 2);
    const builder = createBlockBuilder();

    builder.add("json", text);

    return {
      format: "json",
      parser: "json",
      blocks: builder.blocks,
    };
  }
}
