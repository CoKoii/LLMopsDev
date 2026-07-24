import { parse } from "csv-parse/sync";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  createTableText,
  getExtension,
  isContentType,
} from "./parser.utils";

export class CsvDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return (
      getExtension(input.filename) === "csv" || isContentType(input, "csv")
    );
  }

  parse(input: DocumentParserInput) {
    const rows = parse(input.buffer.toString("utf8"), {
      bom: true,
      relaxColumnCount: true,
      skipEmptyLines: true,
      trim: true,
    }) as string[][];
    const builder = createBlockBuilder();

    builder.add("table", createTableText(rows), {
      rows,
      metadata: {
        rows: rows.length,
        columns: rows[0]?.length ?? 0,
      },
    });

    return {
      format: "csv",
      parser: "csv-parse",
      blocks: builder.blocks,
    };
  }
}
