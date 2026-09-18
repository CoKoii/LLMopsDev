import type {
  DocumentFormatParser,
  DocumentParserInput,
} from "../document-parser.types";
import { DocumentMultimodalExtractionService } from "../document-multimodal-extraction.service";
import { getExtension } from "./parser.utils";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

export class ImageDocumentParser implements DocumentFormatParser {
  constructor(
    private readonly multimodalExtractionService: DocumentMultimodalExtractionService,
  ) {}

  supports(input: DocumentParserInput) {
    return (
      input.contentType.toLowerCase().startsWith("image/") ||
      IMAGE_EXTENSIONS.has(getExtension(input.filename))
    );
  }

  async parse(input: DocumentParserInput) {
    const result = await this.multimodalExtractionService.extractImage({
      filename: input.filename,
      contentType: input.contentType,
      buffer: input.buffer,
    });

    return {
      format: "image",
      parser: result.model,
      tokens: result.tokens,
      blocks: [
        {
          id: "block-1",
          type: "paragraph" as const,
          text: result.text,
          metadata: { parser: result.model },
        },
      ],
    };
  }
}
