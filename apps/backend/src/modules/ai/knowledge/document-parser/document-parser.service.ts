import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  DocumentFormatParser,
  DocumentParserInput,
  ParsedDocument,
} from "./document-parser.types";
import { CsvDocumentParser } from "./parsers/csv.parser";
import { DocxDocumentParser } from "./parsers/docx.parser";
import { ExcelDocumentParser } from "./parsers/excel.parser";
import { HtmlDocumentParser } from "./parsers/html.parser";
import { JsonDocumentParser } from "./parsers/json.parser";
import { MarkdownDocumentParser } from "./parsers/markdown.parser";
import { blocksToText, getExtension } from "./parsers/parser.utils";
import { PdfDocumentParser } from "./parsers/pdf.parser";
import { TextDocumentParser } from "./parsers/text.parser";

@Injectable()
export class DocumentParserService {
  private readonly parsers: DocumentFormatParser[] = [
    new MarkdownDocumentParser(),
    new TextDocumentParser(),
    new JsonDocumentParser(),
    new CsvDocumentParser(),
    new HtmlDocumentParser(),
    new PdfDocumentParser(),
    new DocxDocumentParser(),
    new ExcelDocumentParser(),
  ];

  async parse(input: DocumentParserInput): Promise<ParsedDocument> {
    const parser = this.parsers.find((item) => item.supports(input));

    if (!parser) {
      throw new BadRequestException(
        `暂不支持解析 ${getExtension(input.filename) || input.contentType}`,
      );
    }

    const result = await parser.parse(input);
    const text = blocksToText(result.blocks);

    return {
      title: input.filename,
      format: result.format,
      contentType: input.contentType,
      text,
      characterCount: text.length,
      blocks: result.blocks,
      metadata: {
        parser: result.parser,
        blockCount: result.blocks.length,
        warnings: result.warnings,
      },
    };
  }
}
