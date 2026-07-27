import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getAiEnvironment } from "../../../../common/config/env";
import type { RerankResult } from "./document-reranker.types";

interface RerankResponseItem {
  index?: number;
  document_index?: number;
  relevance_score?: number;
  relevanceScore?: number;
  score?: number;
}

interface RerankResponse {
  results?: RerankResponseItem[];
  data?: RerankResponseItem[];
  output?: {
    results?: RerankResponseItem[];
  };
}

const MAX_RERANK_DOCUMENT_CHARS = 4000;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const compactDocument = (value: string) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_RERANK_DOCUMENT_CHARS
    ? text.slice(0, MAX_RERANK_DOCUMENT_CHARS)
    : text;
};

const extractResponseItems = (data: RerankResponse) =>
  data.results ?? data.data ?? data.output?.results ?? [];

const normalizeRerankItem = (item: RerankResponseItem): RerankResult | null => {
  const index = item.index ?? item.document_index;
  const score = item.relevance_score ?? item.relevanceScore ?? item.score;

  if (typeof index !== "number" || typeof score !== "number") return null;

  return { index, score };
};

@Injectable()
export class DocumentRerankerService {
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    const config = getAiEnvironment(configService).rerank;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    const normalizedQuery = query.trim();
    const normalizedDocuments = documents.map(compactDocument);
    if (!normalizedQuery || normalizedDocuments.length <= 1) return [];

    try {
      return await this.executeRerank(normalizedQuery, normalizedDocuments);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new BadGatewayException(`在线 rerank 调用失败：${message}`);
    }
  }

  private async executeRerank(
    query: string,
    documents: string[],
  ): Promise<RerankResult[]> {
    const response = await fetch(`${this.baseUrl}/rerank`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents,
        top_n: documents.length,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as RerankResponse;
    const results = extractResponseItems(data)
      .map(normalizeRerankItem)
      .filter((item): item is RerankResult => Boolean(item));

    if (!results.length) {
      throw new Error("rerank 响应为空或格式不支持");
    }

    return results;
  }
}
