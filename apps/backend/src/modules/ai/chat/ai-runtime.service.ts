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
const MULTIMODAL_EXTRACTION_MODEL = "gemini-2.5-flash-lite";
const TEXT_ONLY_MULTIMODAL_HOSTS = new Set(["api.deepseek.com"]);
type CreateAgentOptions = {
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

  private async resolveLlm(config: AiAppVersionConfig) {
    if (!config.llmId) {
      throw new BadRequestException("请先选择模型");
    }

    const llm = await this.llmRepository.findOne({
      where: { id: config.llmId },
    });
    if (!llm) throw new BadRequestException("模型不存在");

    return llm;
  }

  private isKnownTextOnlyMultimodalEndpoint(llm: Llm) {
    try {
      const host = new URL(llm.url).host.toLowerCase();
      if (TEXT_ONLY_MULTIMODAL_HOSTS.has(host)) return true;
    } catch {
      return false;
    }

    return llm.provider.toLowerCase().includes("deepseek");
  }

  private async resolveMultimodalLlm(config: AiAppVersionConfig) {
    const primary = await this.resolveLlm(config);
    if (!this.isKnownTextOnlyMultimodalEndpoint(primary)) return primary;

    const alternatives = await this.llmRepository.find({
      where: { modelName: primary.modelName },
      order: { id: "DESC" },
    });
    const compatible = alternatives.find(
      (llm) =>
        llm.id !== primary.id && !this.isKnownTextOnlyMultimodalEndpoint(llm),
    );
    if (compatible) return compatible;

    throw new BadRequestException(
      `当前模型通道 ${primary.provider}/${primary.modelName} 不支持图片解析，请配置支持多模态的模型通道`,
    );
  }

  async createModel(config: AiAppVersionConfig): Promise<ChatOpenAI> {
    const llm = await this.resolveLlm(config);
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

  async createMultimodalExtractionModel(config: AiAppVersionConfig) {
    const llm = await this.resolveMultimodalLlm(config);

    return new ChatOpenAI({
      apiKey: llm.apiKey,
      model: MULTIMODAL_EXTRACTION_MODEL,
      maxRetries: 1,
      temperature: 0,
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
          "回答正文不要输出 [1]、[2] 这样的编号引用；来源由界面单独展示。",
          options.knowledgeContext,
        ].join("\n")
      : "";
    const currentAttachmentInstruction = options.currentAttachmentContext
      ? [
          "以下是用户本轮消息上传的附件解析内容，它们是当前用户问题的一部分。",
          "回答“这张图、第一张、第二张、这两个图片、附件里的内容”等问题时，必须优先对应这些本轮附件编号。",
          "不要声称没有看到附件；如果解析内容不足，只能说明附件解析内容不足。",
          options.currentAttachmentContext,
        ].join("\n")
      : "";
    const recalledAttachmentInstruction = options.recalledAttachmentContext
      ? [
          "以下是当前会话历史附件的召回内容，用于回答用户对之前附件的追问。",
          "如果历史附件内容与当前问题无关，可以忽略；如果内容不足，请明确说明不足，不要编造。",
          options.recalledAttachmentContext,
        ].join("\n")
      : "";

    return [
      DEBUG_SYSTEM_PROMPT,
      config.prompt?.trim(),
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
