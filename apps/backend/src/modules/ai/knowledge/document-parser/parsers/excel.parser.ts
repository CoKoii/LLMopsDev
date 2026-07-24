import * as XLSX from "xlsx";
import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import {
  createBlockBuilder,
  createTableText,
  getExtension,
} from "./parser.utils";

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls"]);

export class ExcelDocumentParser implements DocumentFormatParser {
  supports(input: DocumentParserInput) {
    return EXCEL_EXTENSIONS.has(getExtension(input.filename));
  }

  parse(input: DocumentParserInput) {
    const workbook = XLSX.read(input.buffer, { type: "buffer" });
    const builder = createBlockBuilder();

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      const normalizedRows = rows.map((row) => row.map((cell) => String(cell)));
      const nonEmptyRows = normalizedRows.filter((row) =>
        row.some((cell) => cell.trim()),
      );

      builder.add("heading", sheetName, { level: 1 });

      if (nonEmptyRows.length) {
        builder.add("table", createTableText(nonEmptyRows), {
          rows: nonEmptyRows,
          metadata: {
            sheetName,
            rows: nonEmptyRows.length,
            columns: nonEmptyRows[0]?.length ?? 0,
          },
        });
      }
    }

    return {
      format: "excel",
      parser: "xlsx",
      blocks: builder.blocks,
    };
  }
}
