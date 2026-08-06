import { OpenAIEmbeddings } from "@langchain/openai";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { LlmService } from "../../llm/llm.service";
import type { EmbeddingResult } from "./document-embedding.types";

interface EmbedOptions {
  onStart?: () => Promise<void> | void;
}

const MAX_EMBEDDING_REQUEST_ATTEMPTS = 2;
const EMBEDDING_RETRY_DELAY_MS = 500;
const EMBEDDING_BATCH_SIZE = 20;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

@Injectable()
export class DocumentEmbeddingService {
  constructor(private readonly llmService: LlmService) {}

  async embed(
    input: string[],
    options: EmbedOptions = {},
  ): Promise<EmbeddingResult> {
    await options.onStart?.();
    return this.executeEmbed(input);
  }

  private async executeEmbed(input: string[]): Promise<EmbeddingResult> {
    const texts = input.map((item) => item.trim());
    const nonEmptyTexts = texts.filter(Boolean);
    if (!nonEmptyTexts.length) {
      return { model: "", dimension: 0, vectors: [] };
    }

    const { embeddings, modelName } =
      await this.llmService.createEmbeddingClient();
    const embeddedVectors: number[][] = [];
    for (const batch of chunkArray(nonEmptyTexts, EMBEDDING_BATCH_SIZE)) {
      embeddedVectors.push(
        ...(await this.embedTextsWithRetry(embeddings, batch)),
      );
    }

    // 与输入保持一一对应，避免空文本过滤导致调用方向量错位。
    let embeddedIndex = 0;
    const vectors = texts.map((text) => {
      if (!text) return [];
      return embeddedVectors[embeddedIndex++] ?? [];
    });

    const dimension = embeddedVectors[0]?.length ?? 0;
    return {
      model: modelName,
      dimension,
      vectors,
    };
  }

  private async embedTextsWithRetry(
    embeddings: OpenAIEmbeddings,
    input: string[],
  ): Promise<number[][]> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= MAX_EMBEDDING_REQUEST_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.embedTexts(embeddings, input);
      } catch (error) {
        lastError = error;
        if (
          attempt >= MAX_EMBEDDING_REQUEST_ATTEMPTS ||
          !getErrorMessage(error).includes("EOF")
        ) {
          throw error;
        }
        await wait(EMBEDDING_RETRY_DELAY_MS);
      }
    }

    throw lastError;
  }

  private async embedTexts(
    embeddings: OpenAIEmbeddings,
    input: string[],
  ): Promise<number[][]> {
    try {
      return await embeddings.embedDocuments(input);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new BadGatewayException(`在线 embedding 调用失败：${message}`);
    }
  }
}
