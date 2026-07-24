import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import Redis from "ioredis";
import {
  createDocumentProcessRedisOptions,
  KNOWLEDGE_DOCUMENT_PROCESS_JOB,
  KNOWLEDGE_DOCUMENT_PROCESS_QUEUE,
  type KnowledgeDocumentProcessJobData,
} from "./document-process.queue";

const JOB_RETENTION = {
  age: 3600,
  count: 1000,
};

@Injectable()
export class DocumentProcessQueueService
  implements OnModuleInit, OnApplicationShutdown
{
  private queue?: Queue<KnowledgeDocumentProcessJobData>;
  private connection?: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.connection = new Redis(
      createDocumentProcessRedisOptions(this.configService),
    );
    this.queue = new Queue<KnowledgeDocumentProcessJobData>(
      KNOWLEDGE_DOCUMENT_PROCESS_QUEUE,
      {
        connection: this.connection,
        prefix: "bull",
      },
    );
  }

  async enqueue(data: KnowledgeDocumentProcessJobData) {
    const queue = this.getQueue();
    const jobId = this.createJobId(data.documentId);
    const existingJob = await queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (["active", "waiting", "delayed", "prioritized"].includes(state)) {
        return;
      }

      await existingJob.remove();
    }

    await queue.add(KNOWLEDGE_DOCUMENT_PROCESS_JOB, data, {
      jobId,
      removeOnComplete: JOB_RETENTION,
      removeOnFail: JOB_RETENTION,
    });
  }

  async onApplicationShutdown() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue() {
    if (!this.queue) {
      throw new Error("文档处理队列尚未初始化");
    }
    return this.queue;
  }

  private createJobId(documentId: number) {
    return `knowledge-document:${documentId}:process`;
  }
}
