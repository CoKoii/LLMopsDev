import { BadGatewayException, Injectable } from "@nestjs/common";
import type { UpsertVectorPoint } from "./document-vector-store.types";

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

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_COLLECTION = "ai_knowledge_chunks";

@Injectable()
export class DocumentVectorStoreService {
  readonly collection =
    process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION;

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

  async deleteKnowledgePoints(knowledgeId: number) {
    await this.deleteByFilter([
      { key: "knowledgeId", match: { value: knowledgeId } },
    ]);
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
