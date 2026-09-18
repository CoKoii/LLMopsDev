import { ChatOpenAI } from "@langchain/openai";
import { Injectable } from "@nestjs/common";
import { LlmUsageType } from "../../llm/entities/llm.entity";
import { LlmService } from "../../llm/llm.service";

const MULTIMODAL_EXTRACTION_PROMPT = [
  "将附件内容转换为后续对话和检索可使用的中文文本。",
  "保留可见事实、文字、结构、关键数值和空间关系。",
  "只描述附件中能确认的信息；不要推断意图，不要编造。",
].join("\n");

type MultimodalExtractionOptions = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

type MultimodalExtractionResult = {
  text: string;
  tokens?: number;
  model: string;
};

const getMessageText = (message: unknown) => {
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return item.text;
      }
      return "";
    })
    .join("\n")
    .trim();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const getUsageTotal = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  const usage =
    (isRecord(value.usage_metadata) && value.usage_metadata) ||
    (isRecord(value.usage) && value.usage) ||
    (isRecord(value.response_metadata) &&
      isRecord(value.response_metadata.usage) &&
      value.response_metadata.usage);
  if (!usage) return undefined;

  const total =
    getNumber(usage.total_tokens) ??
    getNumber(usage.totalTokens);
  if (total !== undefined) return total;

  const input =
    getNumber(usage.input_tokens) ??
    getNumber(usage.prompt_tokens);
  const output =
    getNumber(usage.output_tokens) ??
    getNumber(usage.completion_tokens);
  return input !== undefined && output !== undefined
    ? input + output
    : undefined;
};

export const getAiMessageTokens = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const ownUsage = getUsageTotal(value);
  if (ownUsage !== undefined) return ownUsage;
  if (Array.isArray(value)) {
    let total = 0;
    let hasUsage = false;
    for (const item of value) {
      const tokens = getAiMessageTokens(item);
      if (tokens === undefined) continue;
      total += tokens;
      hasUsage = true;
    }
    return hasUsage ? total : undefined;
  }
  if (isRecord(value) && "messages" in value) {
    return getAiMessageTokens(value.messages);
  }
  if (isRecord(value) && "raw" in value) {
    return getAiMessageTokens(value.raw);
  }
  return undefined;
};

@Injectable()
export class DocumentMultimodalExtractionService {
  constructor(private readonly llmService: LlmService) {}

  async extractImage(
    options: MultimodalExtractionOptions,
  ): Promise<MultimodalExtractionResult> {
    const { model, modelName } = await this.createModel();
    const imageUrl = `data:${options.contentType};base64,${options.buffer.toString("base64")}`;
    const response = await model.invoke([
      ["system", MULTIMODAL_EXTRACTION_PROMPT],
      [
        "human",
        [
          { type: "text", text: `请提取附件 ${options.filename} 中的有效信息。` },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      ],
    ]);

    return {
      text: getMessageText(response),
      tokens: getAiMessageTokens(response) ?? 0,
      model: modelName,
    };
  }

  private async createModel() {
    const llm = await this.llmService.resolveEnabledSystemModel(
      LlmUsageType.MULTIMODAL,
    );
    return {
      modelName: llm.modelName,
      model: new ChatOpenAI({
        apiKey: llm.apiKey,
        model: llm.modelName,
        maxRetries: 1,
        temperature: 0,
        configuration: { baseURL: llm.baseUrl },
      }),
    };
  }
}
