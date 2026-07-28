import { ChatOpenAI } from "@langchain/openai";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { z } from "zod";
import { getAiEnvironment } from "../../../common/config/env";
import {
  AiAppVersion,
  AiAppVersionStatus,
} from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import {
  CHAT_MESSAGE_ROLE,
  CHAT_MESSAGE_STATUS,
  ChatMessage,
} from "./entities/chat-message.entity";
import { ChatSessionSummary } from "./entities/chat-session-summary.entity";
import { ChatSession } from "./entities/chat-session.entity";
import { ChatUserMemory } from "./entities/chat-user-memory.entity";

const DRAFT_VERSION = "draft";
const SUMMARY_BATCH_LIMIT = 120;
const MEMORY_MAX_CONTEXT_MESSAGES = 80;
const SESSION_SUMMARY_PROMPT = [
  "你负责维护一段会话的中期记忆摘要。",
  "基于旧摘要和新增消息，输出更新后的会话摘要。",
  "保留用户目标、关键决策、重要约束、正在处理的问题和未完成事项。",
  "删除寒暄、重复内容和无效过程。不要编造。",
].join("\n");
const LONG_TERM_MEMORY_PROMPT = [
  "你负责从会话摘要中抽取长期记忆。",
  "只保留未来对这个 AI 应用服务该用户仍然有帮助的稳定信息。",
  "包括用户偏好、长期事实、项目背景、长期约束和反复强调的工作习惯。",
  "不要保存临时任务进展、一次性文件内容、普通问答或不确定推断。",
  "如果没有值得长期保存的信息，输出空字符串。",
].join("\n");

const SessionSummarySchema = z
  .object({
    summary: z.string(),
  })
  .strict();
const LongTermMemorySchema = z
  .object({
    memory: z.string(),
  })
  .strict();

type StructuredOutputWithParsed<T> = {
  parsed?: T;
};

const compactText = (value: string, maxLength: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

@Injectable()
export class ChatMemoryService {
  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSessionSummary)
    private readonly summaryRepository: Repository<ChatSessionSummary>,
    @InjectRepository(ChatUserMemory)
    private readonly memoryRepository: Repository<ChatUserMemory>,
    private readonly configService: ConfigService,
  ) {}

  async getMemory(appId: number, userId: number) {
    await this.ensureAppAccess(appId, userId);
    const memory = await this.findOrCreateMemory(appId, userId);

    return {
      id: memory.id,
      content: memory.content ?? "",
      generatedAt: memory.generatedAt,
      updatedAt: memory.updatedAt,
    };
  }

  async updateManualMemory(appId: number, userId: number, content: string) {
    await this.ensureAppAccess(appId, userId);
    const memory = await this.findOrCreateMemory(appId, userId);
    memory.content = content.trim();
    memory.updatedBy = userId;
    await this.memoryRepository.save(memory);

    return this.getMemory(appId, userId);
  }

  async createLongTermMemoryContext(appId: number, userId: number) {
    const memory = await this.memoryRepository.findOne({
      where: { appId, userId },
    });
    if (!memory) return "";

    return memory.content?.trim() ?? "";
  }

  async createSessionSummaryContext(sessionId: number) {
    const summary = await this.summaryRepository.findOne({
      where: { sessionId },
    });
    return summary?.content?.trim() ?? "";
  }

  async refreshMemory(params: {
    appId: number;
    userId: number;
    sessionId: number;
  }) {
    const draft = await this.appVersionRepository.findOne({
      where: {
        appId: params.appId,
        version: DRAFT_VERSION,
        status: AiAppVersionStatus.DRAFT,
      },
    });
    if (!draft?.config.toggles?.longTermMemory) return;

    const session = await this.sessionRepository.findOne({
      where: {
        id: params.sessionId,
        appId: params.appId,
        userId: params.userId,
      },
    });
    if (!session) return;

    const summary = await this.findOrCreateSummary(params);
    const messages = await this.loadUnsummarizedMessages(
      params.sessionId,
      summary.coveredMessageId,
    );
    const threshold = this.resolveSummaryThresholdMessages(
      draft.config.modelSettings?.contextRounds,
    );
    if (messages.length < threshold) return;

    const nextSummary = await this.generateSessionSummary(
      summary.content ?? "",
      messages,
    );
    const lastMessage = messages[messages.length - 1];
    if (!nextSummary || !lastMessage) return;

    summary.content = nextSummary;
    summary.coveredMessageId = lastMessage.id;
    summary.coveredMessageCount += messages.length;
    summary.refreshedAt = new Date();
    summary.updatedBy = params.userId;
    await this.summaryRepository.save(summary);

    const nextLongTermMemory = await this.generateLongTermMemory({
      existingMemory:
        (
          await this.memoryRepository.findOne({
            where: { appId: params.appId, userId: params.userId },
          })
        )?.content ?? "",
      sessionSummary: nextSummary,
    });
    if (nextLongTermMemory === undefined) return;

    const memory = await this.findOrCreateMemory(params.appId, params.userId);
    memory.content = nextLongTermMemory;
    memory.sourceSessionId = params.sessionId;
    memory.generatedAt = new Date();
    memory.updatedBy = params.userId;
    await this.memoryRepository.save(memory);
  }

  private async ensureAppAccess(appId: number, userId: number) {
    const app = await this.appRepository.findOne({
      where: { id: appId, createdBy: userId },
    });
    if (!app) throw new ForbiddenException("无权访问该AI应用");
  }

  private async findOrCreateMemory(appId: number, userId: number) {
    const existing = await this.memoryRepository.findOne({
      where: { appId, userId },
    });
    if (existing) return existing;

    return this.memoryRepository.save(
      this.memoryRepository.create({
        appId,
        userId,
        content: "",
        createdBy: userId,
        updatedBy: userId,
      }),
    );
  }

  private async findOrCreateSummary(params: {
    appId: number;
    userId: number;
    sessionId: number;
  }) {
    const existing = await this.summaryRepository.findOne({
      where: { sessionId: params.sessionId },
    });
    if (existing) return existing;

    return this.summaryRepository.save(
      this.summaryRepository.create({
        appId: params.appId,
        userId: params.userId,
        sessionId: params.sessionId,
        coveredMessageId: 0,
        coveredMessageCount: 0,
        content: "",
        createdBy: params.userId,
        updatedBy: params.userId,
      }),
    );
  }

  private async loadUnsummarizedMessages(
    sessionId: number,
    coveredMessageId: number,
  ) {
    return this.messageRepository.find({
      where: {
        sessionId,
        id: MoreThan(coveredMessageId),
        status: CHAT_MESSAGE_STATUS.COMPLETED,
      },
      order: { id: "ASC" },
      take: SUMMARY_BATCH_LIMIT,
    });
  }

  private resolveSummaryThresholdMessages(contextRounds?: number) {
    const rounds = Math.max(8, Math.floor((contextRounds ?? 10) / 2));
    return rounds * 2;
  }

  private createStructuredOutputModel() {
    const config = getAiEnvironment(this.configService).structuredOutput;

    return new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      maxRetries: 0,
      temperature: 0,
      configuration: { baseURL: config.baseUrl },
    });
  }

  private async generateSessionSummary(
    previousSummary: string,
    messages: ChatMessage[],
  ) {
    const structuredModel =
      this.createStructuredOutputModel().withStructuredOutput(
        SessionSummarySchema,
        { name: "SessionSummary", includeRaw: true },
      );
    const conversation = messages
      .slice(-MEMORY_MAX_CONTEXT_MESSAGES)
      .map((message) => {
        const role =
          message.role === CHAT_MESSAGE_ROLE.ASSISTANT ? "AI" : "用户";
        return `${role}：${compactText(message.content, 1200)}`;
      })
      .join("\n\n");
    const response = (await structuredModel.invoke([
      ["system", SESSION_SUMMARY_PROMPT],
      [
        "human",
        [
          previousSummary ? `旧摘要：\n${previousSummary}` : "旧摘要：无",
          `新增消息：\n${conversation}`,
        ].join("\n\n"),
      ],
    ])) as StructuredOutputWithParsed<z.infer<typeof SessionSummarySchema>>;

    return response.parsed?.summary.trim() ?? "";
  }

  private async generateLongTermMemory(params: {
    existingMemory: string;
    sessionSummary: string;
  }) {
    const structuredModel =
      this.createStructuredOutputModel().withStructuredOutput(
        LongTermMemorySchema,
        { name: "LongTermMemory", includeRaw: true },
      );
    const response = (await structuredModel.invoke([
      ["system", LONG_TERM_MEMORY_PROMPT],
      [
        "human",
        [
          params.existingMemory
            ? `已有长期记忆：\n${params.existingMemory}`
            : "已有长期记忆：无",
          `最新会话摘要：\n${params.sessionSummary}`,
        ].join("\n\n"),
      ],
    ])) as StructuredOutputWithParsed<z.infer<typeof LongTermMemorySchema>>;
    const memory = response.parsed?.memory.trim();

    return memory === undefined ? undefined : memory;
  }
}
