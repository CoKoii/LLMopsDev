import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AiAppVersion,
  AiAppVersionStatus,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import { LlmService } from "../llm/llm.service";
import { PluginToolService } from "../plugin/plugin-tool.service";

const DRAFT_VERSION = "draft";
type CreateAgentOptions = {
  longTermMemoryContext?: string;
  sessionSummaryContext?: string;
  knowledgeContext?: string;
  currentAttachmentContext?: string;
  recalledAttachmentContext?: string;
};

@Injectable()
export class AiRuntimeService {
  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    private readonly llmService: LlmService,
    private readonly pluginToolService: PluginToolService,
  ) {}

  async getDraft(appId: number, userId: number): Promise<AiAppVersion> {
    const app = await this.appRepository.findOne({
      where: { id: appId, createdBy: userId },
    });
    if (!app) throw new NotFoundException("AI应用不存在");

    const draft = await this.appVersionRepository.findOne({
      where: {
        appId,
        version: DRAFT_VERSION,
        status: AiAppVersionStatus.DRAFT,
      },
    });
    if (!draft) throw new NotFoundException("AI应用草稿不存在");

    return draft;
  }

  async createModel(config: AiAppVersionConfig): Promise<ChatOpenAI> {
    if (!config.llmId) {
      throw new NotFoundException("请先选择模型");
    }
    const settings = config.modelSettings ?? {};

    return this.llmService.createChatModelById(config.llmId, {
      maxRetries: 1,
      streamUsage: true,
      temperature: settings.temperature,
      topP: settings.topP,
      frequencyPenalty: settings.frequencyPenalty,
      presencePenalty: settings.presencePenalty,
    });
  }

  private createSystemPrompt(
    config: AiAppVersionConfig,
    options: CreateAgentOptions = {},
  ) {
    const longTermMemoryInstruction = options.longTermMemoryContext
      ? [
          "用户长期记忆：用于理解稳定偏好和背景；与当前问题冲突时，以当前明确要求为准。",
          options.longTermMemoryContext,
        ].join("\n")
      : "";
    const sessionSummaryInstruction = options.sessionSummaryContext
      ? [
          "会话摘要：用于补充较早上下文；精确细节以最近对话、附件和知识库为准。",
          options.sessionSummaryContext,
        ].join("\n")
      : "";
    const knowledgeInstruction = options.knowledgeContext
      ? [
          "知识库召回：相关时优先使用；无关时可忽略。不要编造知识库内容。",
          options.knowledgeContext,
        ].join("\n")
      : "";
    const currentAttachmentInstruction = options.currentAttachmentContext
      ? [
          "本轮附件：以下解析内容属于当前问题，涉及“这张图/附件/第几个文件”时优先对应本轮附件。",
          "解析内容不足时说明不足，不要声称未看到附件或编造内容。",
          options.currentAttachmentContext,
        ].join("\n")
      : "";
    const recalledAttachmentInstruction = options.recalledAttachmentContext
      ? [
          "历史附件召回：用于回答对之前附件的追问；无关可忽略，内容不足时说明不足。",
          options.recalledAttachmentContext,
        ].join("\n")
      : "";

    return [
      config.prompt?.trim(),
      longTermMemoryInstruction,
      sessionSummaryInstruction,
      knowledgeInstruction,
      currentAttachmentInstruction,
      recalledAttachmentInstruction,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async createAgentFromDraft(
    draft: AiAppVersion,
    model: ChatOpenAI,
    userId: number,
    options: CreateAgentOptions = {},
  ) {
    const tools = await this.pluginToolService.loadEnabledTools(
      draft.config,
      userId,
    );
    const systemPrompt = this.createSystemPrompt(draft.config, options);

    return {
      draft,
      model,
      tools,
      systemPrompt,
      agent: createAgent({
        model,
        tools,
        systemPrompt,
      }),
    };
  }

  async createAgent(
    appId: number,
    userId: number,
    options: CreateAgentOptions = {},
  ) {
    const draft = await this.getDraft(appId, userId);
    const model = await this.createModel(draft.config);
    return this.createAgentFromDraft(draft, model, userId, options);
  }
}
