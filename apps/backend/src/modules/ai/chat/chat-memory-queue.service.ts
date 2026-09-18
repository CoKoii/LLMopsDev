import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import Redis from "ioredis";
import {
  CHAT_MEMORY_QUEUE,
  CHAT_MEMORY_REFRESH_JOB,
  createChatMemoryRedisOptions,
  type ChatMemoryRefreshJobData,
} from "./chat-memory.queue";

const REFRESH_DELAY_MS = 30_000;
const JOB_RETENTION = {
  age: 3600,
  count: 1000,
};

@Injectable()
export class ChatMemoryQueueService
  implements OnModuleInit, OnApplicationShutdown
{
  private queue?: Queue<ChatMemoryRefreshJobData>;
  private connection?: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.connection = new Redis(createChatMemoryRedisOptions(this.configService));
    this.queue = new Queue<ChatMemoryRefreshJobData>(CHAT_MEMORY_QUEUE, {
      connection: this.connection,
      prefix: "bull",
    });
  }

  async enqueueRefresh(data: ChatMemoryRefreshJobData) {
    const queue = this.getQueue();
    const jobId = this.createRefreshJobId(data);
    const existingJob = await queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (["active", "waiting", "delayed", "prioritized"].includes(state)) {
        return;
      }
      await existingJob.remove();
    }

    await queue.add(CHAT_MEMORY_REFRESH_JOB, data, {
      jobId,
      delay: REFRESH_DELAY_MS,
      attempts: 2,
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
      throw new Error("对话记忆队列尚未初始化");
    }
    return this.queue;
  }

  private createRefreshJobId(data: ChatMemoryRefreshJobData) {
    return `chat-memory-${data.appId}-${data.userId}-${data.sessionId}`;
  }
}
