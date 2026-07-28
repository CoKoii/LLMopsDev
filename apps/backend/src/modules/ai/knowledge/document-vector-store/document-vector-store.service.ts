import { BadGatewayException, Injectable } from "@nestjs/common";
import type {
  ChatAttachmentVectorPointPayload,
  KnowledgeVectorPointPayload,
  SearchVectorPoint,
  UpsertVectorPoint,
  VectorPointPayload,
} from "./document-vector-store.types";

interface QdrantCollectionInfoResponse {
  result?: {
    config?: {
      params?: {
        vectors?: {
          size?: number;
          distance?: string;
        };
      };
    };
  };
}

interface QdrantSearchResponse {
  result?: Array<{
    score?: number;
    payload?: VectorPointPayload;
  }>;
}

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_COLLECTION = "ai_knowledge_chunks";
const VECTOR_UPSERT_BATCH_SIZE = 64;

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

@Injectable()
export class DocumentVectorStoreService {
  readonly collection = process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION;

  private readonly baseUrl = (
    process.env.QDRANT_URL ?? DEFAULT_QDRANT_URL
  ).replace(/\/+$/, "");

  async ensureCollection(vectorSize: number) {
    if (!vectorSize) {
      throw new BadGatewayException("向量维度为空，无法创建向量索引");
    }

    const collectionUrl = `${this.baseUrl}/collections/${this.collection}`;
    const response = await fetch(collectionUrl);
    if (response.status === 404) {
      await this.createCollection(vectorSize);
      return;
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Qdrant 集合检查失败：${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as QdrantCollectionInfoResponse;
    const currentSize = data.result?.config?.params?.vectors?.size;
    if (currentSize && currentSize !== vectorSize) {
      throw new BadGatewayException(
        `Qdrant 集合向量维度不匹配：当前 ${currentSize}，需要 ${vectorSize}`,
      );
    }
  }

  async upsert(points: UpsertVectorPoint[]) {
    if (!points.length) return;

    for (const batch of chunkArray(points, VECTOR_UPSERT_BATCH_SIZE)) {
      await this.upsertBatch(batch);
    }
  }

  private async upsertBatch(points: UpsertVectorPoint[]) {
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points?wait=true`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          points: points.map((point) => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload,
          })),
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `Qdrant 写入失败：${response.status} ${await response.text()}`,
      );
    }
  }

  async deleteDocumentPoints(documentId: number) {
    await this.deleteByFilter([
      { key: "documentId", match: { value: documentId } },
    ]);
  }

  async deleteChunkPoint(chunkId: number) {
    await this.deleteByFilter([{ key: "chunkId", match: { value: chunkId } }]);
  }

  async deleteKnowledgePoints(knowledgeId: number) {
    await this.deleteByFilter([
      { key: "knowledgeId", match: { value: knowledgeId } },
    ]);
  }

  async search(params: {
    vector: number[];
    knowledgeId: number;
    limit: number;
    scoreThreshold?: number;
  }): Promise<SearchVectorPoint<KnowledgeVectorPointPayload>[]> {
    if (!params.vector.length || params.limit <= 0) return [];

    return this.searchByFilter<KnowledgeVectorPointPayload>({
      vector: params.vector,
      limit: params.limit,
      scoreThreshold: params.scoreThreshold,
      must: [{ key: "knowledgeId", match: { value: params.knowledgeId } }],
    });
  }

  async searchSessionAttachments(params: {
    vector: number[];
    sessionId: number;
    limit: number;
    scoreThreshold?: number;
    excludeMessageId?: number;
  }): Promise<SearchVectorPoint<ChatAttachmentVectorPointPayload>[]> {
    if (!params.vector.length || params.limit <= 0) return [];

    return this.searchByFilter<ChatAttachmentVectorPointPayload>({
      vector: params.vector,
      limit: params.limit,
      scoreThreshold: params.scoreThreshold,
      must: [
        { key: "source", match: { value: "chat_attachment" } },
        { key: "sessionId", match: { value: params.sessionId } },
        { key: "enabled", match: { value: true } },
      ],
      mustNot: params.excludeMessageId
        ? [{ key: "messageId", match: { value: params.excludeMessageId } }]
        : undefined,
    });
  }

  private async searchByFilter<TPayload extends VectorPointPayload>(params: {
    vector: number[];
    limit: number;
    scoreThreshold?: number;
    must: unknown[];
    mustNot?: unknown[];
  }): Promise<SearchVectorPoint<TPayload>[]> {
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/search`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vector: params.vector,
          limit: params.limit,
          with_payload: true,
          score_threshold: params.scoreThreshold,
          filter: {
            must: params.must,
            must_not: params.mustNot,
          },
        }),
      },
    );

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new BadGatewayException(
        `Qdrant 检索失败：${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as QdrantSearchResponse;
    return (data.result ?? [])
      .filter(
        (item): item is { score: number; payload: VectorPointPayload } =>
          typeof item.score === "number" && Boolean(item.payload),
      )
      .map((item) => ({
        score: item.score,
        payload: item.payload as TPayload,
      }));
  }

  private async createCollection(vectorSize: number) {
    const response = await fetch(
      `${this.baseUrl}/collections/${this.collection}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `Qdrant 集合创建失败：${response.status} ${await response.text()}`,
      );
    }
  }

  private async deleteByFilter(must: unknown[]) {
    const collectionResponse = await fetch(
      `${this.baseUrl}/collections/${this.collection}`,
    );
    if (collectionResponse.status === 404) return;
    if (!collectionResponse.ok) {
      throw new BadGatewayException(
        `Qdrant 集合检查失败：${collectionResponse.status} ${await collectionResponse.text()}`,
      );
    }

    const response = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/delete?wait=true`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filter: { must },
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `Qdrant 删除失败：${response.status} ${await response.text()}`,
      );
    }
  }
}
