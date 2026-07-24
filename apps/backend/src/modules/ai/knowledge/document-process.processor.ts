import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import {
  createDocumentProcessRedisOptions,
  KNOWLEDGE_DOCUMENT_PROCESS_QUEUE,
  type KnowledgeDocumentProcessJobData,
} from "./document-process.queue";
import { KnowledgeService } from "./knowledge.service";

@Injectable()
export class DocumentProcessProcessor
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DocumentProcessProcessor.name);
  private worker?: Worker<KnowledgeDocumentProcessJobData>;
  private connection?: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  onModuleInit() {
    this.connection = new Redis(
      createDocumentProcessRedisOptions(this.configService),
    );
    this.worker = new Worker<KnowledgeDocumentProcessJobData>(
      KNOWLEDGE_DOCUMENT_PROCESS_QUEUE,
      (job) => this.process(job),
      {
        connection: this.connection,
        prefix: "bull",
      },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `文档处理任务失败 documentId=${job?.data.documentId}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async process(job: Job<KnowledgeDocumentProcessJobData>) {
    await this.knowledgeService.executeDocumentProcess(
      job.data.knowledgeId,
      job.data.documentId,
      job.data.userId,
      job.data.chunkConfig,
    );
  }
}
