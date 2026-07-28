import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Llm } from "../../llm/entities/llm.entity";

const MULTIMODAL_EXTRACTION_MODEL = "gemini-2.5-flash-lite";
const TEXT_ONLY_MULTIMODAL_HOSTS = new Set(["api.deepseek.com"]);
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
  tokens: number;
  model: string;
};

const getMessageText = (message: AIMessage) => {
  const content = message.content;
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

export const getAiMessageTokens = (value: unknown): number => {
  if (!value) return 0;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + getAiMessageTokens(item), 0);
  }
  if (AIMessage.isInstance(value)) {
    return value.usage_metadata?.total_tokens ?? 0;
  }
  if (typeof value === "object" && "messages" in value) {
    return getAiMessageTokens((value as { messages?: unknown }).messages);
  }
  return 0;
};

@Injectable()
export class DocumentMultimodalExtractionService {
  constructor(
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
  ) {}

  async extractImage(
    options: MultimodalExtractionOptions,
  ): Promise<MultimodalExtractionResult> {
    const model = await this.createModel();
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
      tokens: getAiMessageTokens(response),
      model: MULTIMODAL_EXTRACTION_MODEL,
    };
  }

  private async createModel() {
    const llm = await this.resolveMultimodalLlm();

    return new ChatOpenAI({
      apiKey: llm.apiKey,
      model: MULTIMODAL_EXTRACTION_MODEL,
      maxRetries: 1,
      temperature: 0,
      configuration: { baseURL: llm.url },
    });
  }

  private async resolveMultimodalLlm() {
    const llms = await this.llmRepository.find({ order: { id: "DESC" } });
    const llm = llms.find(
      (item) => !this.isKnownTextOnlyMultimodalEndpoint(item),
    );
    if (llm) return llm;

    throw new BadRequestException(
      `请先配置支持多模态解析的模型通道，解析模型固定使用 ${MULTIMODAL_EXTRACTION_MODEL}`,
    );
  }

  private isKnownTextOnlyMultimodalEndpoint(llm: Llm) {
    try {
      const host = new URL(llm.url).host.toLowerCase();
      if (TEXT_ONLY_MULTIMODAL_HOSTS.has(host)) return true;
    } catch {
      return false;
    }

    return llm.provider.toLowerCase().includes("deepseek");
  }
}
