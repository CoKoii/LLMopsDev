import mammoth from "mammoth";
import type {
  DocumentFormatParser,
  DocumentParserInput,
  ParsedDocumentBlock,
} from "../document-parser.types";
import { DocumentMultimodalExtractionService } from "../document-multimodal-extraction.service";
import { getExtension } from "./parser.utils";
import { parseHtmlBlocks } from "./html.parser";

const MAX_DOCX_EMBEDDED_IMAGES = 8;

export class DocxDocumentParser implements DocumentFormatParser {
  constructor(
    private readonly multimodalExtractionService: DocumentMultimodalExtractionService,
  ) {}

  supports(input: DocumentParserInput) {
    return getExtension(input.filename) === "docx";
  }

  async parse(input: DocumentParserInput) {
    const imageBlocks: ParsedDocumentBlock[] = [];
    let imageTokens = 0;
    let imageCount = 0;
    const result = await mammoth.convertToHtml(
      { buffer: input.buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          imageCount += 1;
          if (imageCount > MAX_DOCX_EMBEDDED_IMAGES) return { src: "" };

          const imageResult = await this.multimodalExtractionService.extractImage({
            filename: `${input.filename}#image-${imageCount}`,
            contentType: image.contentType,
            buffer: await image.readAsBuffer(),
          });
          imageTokens += imageResult.tokens;
          imageBlocks.push({
            id: `embedded-image-${imageCount}`,
            type: "paragraph",
            text: `文档内图片 ${imageCount}：${imageResult.text}`,
            metadata: {
              source: "embedded-image",
              imageIndex: imageCount,
              contentType: image.contentType,
              parser: imageResult.model,
            },
          });

          return { src: "" };
        }),
      },
    );
    const warnings = result.messages.map((item) => item.message).filter(Boolean);
    if (imageCount > MAX_DOCX_EMBEDDED_IMAGES) {
      warnings.push(`内嵌图片超过 ${MAX_DOCX_EMBEDDED_IMAGES} 张，仅解析前 ${MAX_DOCX_EMBEDDED_IMAGES} 张`);
    }

    return {
      format: "docx",
      parser: "mammoth",
      blocks: [...parseHtmlBlocks(result.value), ...imageBlocks],
      warnings,
      tokens: imageTokens,
    };
  }
}
