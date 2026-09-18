import type { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";
import { createRedisOptions } from "../../../common/cache/redis.config";
import type { KnowledgeDocumentChunkConfig } from "./knowledge-document-process.types";

export const KNOWLEDGE_DOCUMENT_PROCESS_QUEUE = "knowledge-document-process";

export const KNOWLEDGE_DOCUMENT_PROCESS_JOB = "process-document";

export interface KnowledgeDocumentProcessJobData {
  knowledgeId: number;
  documentId: number;
  userId: number;
  chunkConfig?: KnowledgeDocumentChunkConfig;
}

export const createDocumentProcessRedisOptions = (
  configService: ConfigService,
): RedisOptions => {
  const options = createRedisOptions(configService);
  delete options.keyPrefix;
  delete options.maxRetriesPerRequest;

  return {
    ...options,
    maxRetriesPerRequest: null,
  };
};
