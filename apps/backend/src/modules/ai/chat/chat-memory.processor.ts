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
  CHAT_MEMORY_QUEUE,
  createChatMemoryRedisOptions,
  type ChatMemoryRefreshJobData,
} from "./chat-memory.queue";
import { ChatMemoryService } from "./chat-memory.service";

@Injectable()
export class ChatMemoryProcessor
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ChatMemoryProcessor.name);
  private worker?: Worker<ChatMemoryRefreshJobData>;
  private connection?: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly chatMemoryService: ChatMemoryService,
  ) {}

  onModuleInit() {
    this.connection = new Redis(createChatMemoryRedisOptions(this.configService));
    this.worker = new Worker<ChatMemoryRefreshJobData>(
      CHAT_MEMORY_QUEUE,
      (job) => this.process(job),
      {
        connection: this.connection,
        prefix: "bull",
        concurrency: 3,
      },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.warn(
        `对话记忆任务失败 sessionId=${job?.data.sessionId}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async process(job: Job<ChatMemoryRefreshJobData>) {
    await this.chatMemoryService.refreshMemory(job.data);
  }
}
