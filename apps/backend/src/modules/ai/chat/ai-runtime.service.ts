import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AiAppVersion,
  AiAppVersionStatus,
  type AiAppVersionConfig,
} from "../app/entities/app-version.entity";
import { AiApp } from "../app/entities/app.entity";
import { Llm } from "../llm/entities/llm.entity";
import { PluginToolService } from "../plugin/plugin-tool.service";

const DRAFT_VERSION = "draft";
const DEBUG_SYSTEM_PROMPT = [
  "需要外部信息时，先调用可用工具获取依据。",
  "通用知识可以直接回答；工具结果优先于自身知识。",
  "工具不可用或信息不足时，不要捏造信息。",
].join("\n");
type CreateAgentOptions = {
  knowledgeContext?: string;
};

@Injectable()
export class AiRuntimeService {
  constructor(
    @InjectRepository(AiApp)
    private readonly appRepository: Repository<AiApp>,
    @InjectRepository(AiAppVersion)
    private readonly appVersionRepository: Repository<AiAppVersion>,
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
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
      throw new BadRequestException("请先选择模型");
    }

    const llm = await this.llmRepository.findOne({
      where: { id: config.llmId },
    });
    if (!llm) throw new BadRequestException("模型不存在");

    const settings = config.modelSettings ?? {};

    return new ChatOpenAI({
      apiKey: llm.apiKey,
      model: llm.modelName,
      maxRetries: 1,
      streamUsage: true,
      temperature: settings.temperature,
      topP: settings.topP,
      frequencyPenalty: settings.frequencyPenalty,
      presencePenalty: settings.presencePenalty,
      configuration: { baseURL: llm.url },
    });
  }

  private createSystemPrompt(
    config: AiAppVersionConfig,
    options: CreateAgentOptions = {},
  ) {
    const knowledgeInstruction = options.knowledgeContext
      ? [
          "以下是知识库召回内容，请优先基于这些内容回答。",
          "如果召回内容与问题无关，可以忽略；如果知识库内容不足，请明确说明不足，不要编造。",
          "使用知识库内容形成结论时，必须在对应句子后标注 [1]、[2] 这样的编号引用。",
          options.knowledgeContext,
        ].join("\n")
      : "";

    return [DEBUG_SYSTEM_PROMPT, config.prompt?.trim(), knowledgeInstruction]
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
