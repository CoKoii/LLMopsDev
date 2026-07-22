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

  async createAgent(appId: number, userId: number) {
    const draft = await this.getDraft(appId, userId);
    const model = await this.createModel(draft.config);
    const tools = await this.pluginToolService.loadEnabledTools(
      draft.config,
      userId,
    );

    return {
      draft,
      model,
      agent: createAgent({
        model,
        tools,
        systemPrompt: draft.config.prompt?.trim() || undefined,
      }),
    };
  }
}
