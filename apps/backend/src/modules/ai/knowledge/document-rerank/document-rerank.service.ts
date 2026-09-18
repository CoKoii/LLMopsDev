import { Injectable, Logger } from "@nestjs/common";
import { LlmUsageType } from "../../llm/entities/llm.entity";
import { LlmService } from "../../llm/llm.service";
import {
  DEFAULT_RERANK_INSTRUCT,
  resolveRerankEndpoint,
} from "../../llm/rerank-endpoint";

interface RerankInputDocument {
  id: number;
  text: string;
}

interface RerankResult {
  id: number;
  score: number;
}

interface RerankResponseItem {
  document?: { text?: string };
  index?: number | string;
  relevance_score?: number | string;
  score?: number | string;
}

interface RerankResponse {
  data?: RerankResponseItem[];
  output?: { results?: RerankResponseItem[] };
  results?: RerankResponseItem[];
}

const clampScore = (score: number) =>
  Math.max(0, Math.min(1, Number(score.toFixed(4))));

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getRerankItems = (value: RerankResponse) =>
  value.results ?? value.output?.results ?? value.data ?? [];

const getRerankScore = (item: RerankResponseItem) => {
  const score = Number(item.relevance_score ?? item.score);
  return Number.isFinite(score) ? clampScore(score) : undefined;
};

@Injectable()
export class DocumentRerankService {
  private readonly logger = new Logger(DocumentRerankService.name);

  constructor(private readonly llmService: LlmService) {}

  async rerank(params: {
    query: string;
    documents: RerankInputDocument[];
    topN?: number;
  }): Promise<RerankResult[]> {
    if (!params.query.trim() || params.documents.length <= 1) return [];

    try {
      const llm = await this.llmService.findEnabledSystemModel(
        LlmUsageType.RERANK,
      );
      if (!llm?.apiKey?.trim()) return [];

      const response = await fetch(resolveRerankEndpoint(llm.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${llm.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: llm.modelName,
          query: params.query,
          documents: params.documents.map((item) => item.text),
          top_n: params.topN ?? params.documents.length,
          instruct: DEFAULT_RERANK_INSTRUCT,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as RerankResponse;
      return getRerankItems(data).flatMap((item) => {
        const index = Number(item.index);
        const score = getRerankScore(item);
        const document = Number.isInteger(index)
          ? params.documents[index]
          : undefined;

        return document && score !== undefined
          ? [{ id: document.id, score }]
          : [];
      });
    } catch (error) {
      this.logger.warn(
        `Rerank 调用失败，使用原始召回排序: ${getErrorMessage(error)}`,
      );
      return [];
    }
  }
}
