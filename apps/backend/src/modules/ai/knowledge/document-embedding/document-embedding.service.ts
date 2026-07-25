import { BadGatewayException, Injectable } from "@nestjs/common";
import type { EmbeddingResult } from "./document-embedding.types";

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
}

interface EmbedOptions {
  onStart?: () => Promise<void> | void;
}

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_EMBEDDING_MODEL = "qwen3-embedding:4b";
const MAX_EMBEDDING_REQUEST_ATTEMPTS = 2;
const EMBEDDING_RETRY_DELAY_MS = 500;
const EMBEDDING_BATCH_SIZE = 32;

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
  readonly model =
    process.env.OLLAMA_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  private readonly baseUrl = (
    process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/+$/, "");

  async embed(
    input: string[],
    options: EmbedOptions = {},
  ): Promise<EmbeddingResult> {
    await options.onStart?.();
    return this.executeEmbed(input);
  }

  private async executeEmbed(input: string[]): Promise<EmbeddingResult> {
    const texts = input.map((item) => item.trim()).filter(Boolean);
    if (!texts.length) {
      return { model: this.model, dimension: 0, vectors: [] };
    }

    const vectors: number[][] = [];
    for (const batch of chunkArray(texts, EMBEDDING_BATCH_SIZE)) {
      vectors.push(...(await this.embedTextsWithRetry(batch)));
    }

    const dimension = vectors[0]?.length ?? 0;
    return { model: this.model, dimension, vectors };
  }

  private async embedTextsWithRetry(input: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= MAX_EMBEDDING_REQUEST_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.embedTexts(input);
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

  private async embedTexts(input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Ollama embedding 调用失败：${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as OllamaEmbedResponse;
    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== input.length) {
      throw new BadGatewayException("Ollama embedding 返回数量与输入不一致");
    }

    return embeddings;
  }
}
