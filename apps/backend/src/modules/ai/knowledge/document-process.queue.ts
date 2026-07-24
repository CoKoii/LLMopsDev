import type { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";
import { createRedisOptions } from "../../../common/cache/redis.config";

export const KNOWLEDGE_DOCUMENT_PROCESS_QUEUE = "knowledge-document-process";

export const KNOWLEDGE_DOCUMENT_PROCESS_JOB = "process-document";

export interface KnowledgeDocumentProcessJobData {
  knowledgeId: number;
  documentId: number;
  userId: number;
}

export const createDocumentProcessRedisOptions = (
  configService: ConfigService,
): RedisOptions => {
  const { keyPrefix, maxRetriesPerRequest, ...options } =
    createRedisOptions(configService);

  return {
    ...options,
    maxRetriesPerRequest: null,
  };
};
