import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Not, Repository, type SelectQueryBuilder } from "typeorm";
import { RequestContextService } from "../../../common/request-context/request-context.service";
import {
  createPageResult,
  type PageResult,
  resolvePageQuery,
} from "../../../common/http/page-query.dto";
import { CreateLlmDto } from "./dto/create-llm.dto";
import { QueryLlmsDto } from "./dto/query-llms.dto";
import { TestLlmDto } from "./dto/test-llm.dto";
import { UpdateLlmDto } from "./dto/update-llm.dto";
import { Llm, LlmTestStatus, LlmUsageType } from "./entities/llm.entity";
import {
  DEFAULT_RERANK_INSTRUCT,
  resolveRerankEndpoint,
} from "./rerank-endpoint";

type LlmSafeResponse = Omit<Llm, "apiKey"> & {
  apiKeyConfigured: boolean;
};

type ChatModelOptions = {
  frequencyPenalty?: number;
  maxRetries?: number;
  presencePenalty?: number;
  streamUsage?: boolean;
  temperature?: number;
  topP?: number;
};

const trimTrailingSlash = (value: string) => value.trim().replace(/\/+$/, "");

const normalizeMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const extractMessageText = (message: AIMessage) => {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return item.text;
      }
      return "";
    })
    .join("\n")
    .trim();
};

const SINGLE_ENABLED_USAGE_TYPES = new Set<LlmUsageType>([
  LlmUsageType.STRUCTURED,
  LlmUsageType.EMBEDDING,
  LlmUsageType.MULTIMODAL,
  LlmUsageType.RERANK,
]);
const API_KEY_CONFIGURED_ALIAS = "apiKeyConfigured";

@Injectable()
export class LlmService {
  constructor(
    @InjectRepository(Llm)
    private readonly llmRepository: Repository<Llm>,
    private readonly dataSource: DataSource,
    private readonly requestContext: RequestContextService,
  ) {}

  private toSafeResponse(
    llm: Llm,
    apiKeyConfigured = Boolean(llm.apiKey),
  ): LlmSafeResponse {
    return {
      id: llm.id,
      usageType: llm.usageType,
      modelName: llm.modelName,
      baseUrl: llm.baseUrl,
      enabled: llm.enabled,
      isDefault: llm.isDefault,
      lastTestStatus: llm.lastTestStatus,
      lastTestMessage: llm.lastTestMessage,
      lastTestedAt: llm.lastTestedAt,
      remark: llm.remark,
      createdAt: llm.createdAt,
      updatedAt: llm.updatedAt,
      deletedAt: llm.deletedAt,
      createdBy: llm.createdBy,
      updatedBy: llm.updatedBy,
      apiKeyConfigured,
    };
  }

  private withApiKeyConfiguredFlag(queryBuilder: SelectQueryBuilder<Llm>) {
    return queryBuilder.addSelect(
      "CASE WHEN llm.apiKey IS NOT NULL AND llm.apiKey <> '' THEN 1 ELSE 0 END",
      API_KEY_CONFIGURED_ALIAS,
    );
  }

  private isApiKeyConfigured(value: unknown) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  private mapSafeResponses(entities: Llm[], raw: Record<string, unknown>[]) {
    return entities.map((item, index) =>
      this.toSafeResponse(
        item,
        this.isApiKeyConfigured(raw[index]?.[API_KEY_CONFIGURED_ALIAS]),
      ),
    );
  }

  private createPayload(dto: CreateLlmDto, userId?: number | null) {
    const enabled = dto.enabled ?? true;
    return {
      usageType: dto.usageType,
      modelName: dto.modelName.trim(),
      baseUrl: trimTrailingSlash(dto.baseUrl),
      apiKey: dto.apiKey.trim(),
      enabled,
      isDefault: SINGLE_ENABLED_USAGE_TYPES.has(dto.usageType)
        ? enabled
        : false,
      remark: dto.remark?.trim() || null,
      createdBy: userId,
      updatedBy: userId,
    };
  }

  private createUpdatePayload(dto: UpdateLlmDto, userId?: number | null) {
    const payload: Partial<Llm> = { updatedBy: userId };

    if (dto.modelName !== undefined) payload.modelName = dto.modelName.trim();
    if (dto.baseUrl !== undefined) {
      payload.baseUrl = trimTrailingSlash(dto.baseUrl);
    }
    if (dto.apiKey !== undefined && dto.apiKey.trim()) {
      payload.apiKey = dto.apiKey.trim();
    }
    if (dto.enabled !== undefined) payload.enabled = dto.enabled;
    if (dto.remark !== undefined) {
      payload.remark = dto.remark?.trim() || null;
    }

    return payload;
  }

  private isSingleEnabledUsageType(usageType: LlmUsageType) {
    return SINGLE_ENABLED_USAGE_TYPES.has(usageType);
  }

  private async saveWithUsageRules(repository: Repository<Llm>, llm: Llm) {
    if (this.isSingleEnabledUsageType(llm.usageType)) {
      llm.isDefault = llm.enabled;
      if (llm.enabled) {
        await repository.update(
          {
            usageType: llm.usageType,
            enabled: true,
            ...(llm.id ? { id: Not(llm.id) } : {}),
          },
          { enabled: false, isDefault: false },
        );
      }
      await repository.save(llm);
      return;
    }

    if (llm.isDefault) {
      await repository.update(
        {
          usageType: llm.usageType,
          isDefault: true,
          ...(llm.id ? { id: Not(llm.id) } : {}),
        },
        { isDefault: false },
      );
    }
    await repository.save(llm);
  }

  private async findRuntimeLlm(id: number) {
    const llm = await this.llmRepository
      .createQueryBuilder("llm")
      .addSelect("llm.apiKey")
      .where("llm.id = :id", { id })
      .getOne();

    if (!llm) throw new NotFoundException("模型配置不存在");
    if (!llm.enabled) throw new BadRequestException("模型配置未启用");
    if (!llm.apiKey?.trim()) throw new BadRequestException("模型API Key未配置");
    return llm;
  }

  async findEnabledSystemModel(usageType: LlmUsageType) {
    return this.llmRepository
      .createQueryBuilder("llm")
      .addSelect("llm.apiKey")
      .where("llm.usageType = :usageType", { usageType })
      .andWhere("llm.enabled = true")
      .orderBy("llm.isDefault", "DESC")
      .addOrderBy("llm.updatedAt", "DESC")
      .addOrderBy("llm.id", "DESC")
      .getOne();
  }

  async resolveEnabledSystemModel(usageType: LlmUsageType) {
    const llm = await this.findEnabledSystemModel(usageType);
    if (!llm) {
      throw new BadRequestException(`请先启用${usageType}模型`);
    }
    if (!llm.apiKey?.trim()) {
      throw new BadRequestException(`${usageType}模型API Key未配置`);
    }

    return llm;
  }

  createChatModel(llm: Llm, options: ChatModelOptions = {}) {
    return new ChatOpenAI({
      apiKey: llm.apiKey,
      model: llm.modelName,
      maxRetries: options.maxRetries ?? 1,
      streamUsage: options.streamUsage,
      temperature: options.temperature,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      configuration: { baseURL: llm.baseUrl },
    });
  }

  async createDefaultChatModel(
    usageType: LlmUsageType,
    options: ChatModelOptions = {},
  ) {
    return this.createChatModel(
      await this.resolveEnabledSystemModel(usageType),
      options,
    );
  }

  async createChatModelById(id: number, options: ChatModelOptions = {}) {
    const llm = await this.findRuntimeLlm(id);
    if (llm.usageType !== LlmUsageType.CHAT) {
      throw new BadRequestException("请选择对话模型");
    }
    return this.createChatModel(llm, options);
  }

  async createEmbeddingClient() {
    const llm = await this.resolveEnabledSystemModel(LlmUsageType.EMBEDDING);
    return {
      modelName: llm.modelName,
      embeddings: new OpenAIEmbeddings({
        apiKey: llm.apiKey,
        model: llm.modelName,
        batchSize: 20,
        configuration: { baseURL: llm.baseUrl },
      }),
    };
  }

  async create(createLlmDto: CreateLlmDto) {
    const userId = this.requestContext.getUserId();

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Llm);
      const llm = repository.create(this.createPayload(createLlmDto, userId));
      await this.saveWithUsageRules(repository, llm);
    });

    return { success: true };
  }

  async list(query: QueryLlmsDto): Promise<PageResult<LlmSafeResponse>> {
    const { page, pageSize, skip } = resolvePageQuery(query);
    const name = query.name?.trim();
    const queryBuilder = this.withApiKeyConfiguredFlag(
      this.llmRepository.createQueryBuilder("llm"),
    );

    if (name) {
      queryBuilder.andWhere("llm.modelName LIKE :name", {
        name: `%${name}%`,
      });
    }
    if (query.usageType) {
      queryBuilder.andWhere("llm.usageType = :usageType", {
        usageType: query.usageType,
      });
    }

    const total = await queryBuilder.getCount();
    const { entities, raw } = await queryBuilder
      .orderBy("llm.id", "DESC")
      .skip(skip)
      .take(pageSize)
      .getRawAndEntities();
    const items = this.mapSafeResponses(entities, raw);

    return createPageResult(items, total, page, pageSize);
  }

  async findOne(id: number) {
    const result = await this.withApiKeyConfiguredFlag(
      this.llmRepository.createQueryBuilder("llm"),
    )
      .where("llm.id = :id", { id })
      .getRawAndEntities();
    const entity = result.entities[0];
    if (!entity) throw new NotFoundException("模型配置不存在");
    return this.toSafeResponse(
      entity,
      this.isApiKeyConfigured(result.raw[0]?.[API_KEY_CONFIGURED_ALIAS]),
    );
  }

  async update(id: number, updateLlmDto: UpdateLlmDto) {
    const userId = this.requestContext.getUserId();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Llm);
      const current = await repository
        .createQueryBuilder("llm")
        .addSelect("llm.apiKey")
        .where("llm.id = :id", { id })
        .getOne();
      if (!current) throw new NotFoundException("模型配置不存在");

      repository.merge(current, this.createUpdatePayload(updateLlmDto, userId));
      await this.saveWithUsageRules(repository, current);
    });

    return { success: true };
  }

  async remove(id: number) {
    const llm = await this.llmRepository.findOne({ where: { id } });
    if (!llm) throw new NotFoundException("模型配置不存在");
    await this.llmRepository.softRemove(llm);
    return { success: true };
  }

  async test(id: number, dto: TestLlmDto) {
    const llm = await this.findRuntimeLlm(id);
    const startedAt = Date.now();

    try {
      const result =
        llm.usageType === LlmUsageType.EMBEDDING
          ? await this.testEmbedding(llm)
          : llm.usageType === LlmUsageType.RERANK
            ? await this.testRerank(llm)
            : await this.testChat(llm, dto.prompt?.trim() || "请回复 ok");

      await this.llmRepository.update(id, {
        lastTestStatus: LlmTestStatus.SUCCESS,
        lastTestMessage: result,
        lastTestedAt: new Date(),
        updatedBy: this.requestContext.getUserId(),
      });

      return {
        success: true,
        elapsedMs: Date.now() - startedAt,
        message: result,
      };
    } catch (error) {
      const message = normalizeMessage(error);
      await this.llmRepository.update(id, {
        lastTestStatus: LlmTestStatus.FAILED,
        lastTestMessage: message,
        lastTestedAt: new Date(),
        updatedBy: this.requestContext.getUserId(),
      });
      throw new BadGatewayException(`模型连通性测试失败：${message}`);
    }
  }

  private async testEmbedding(llm: Llm) {
    const embeddings = new OpenAIEmbeddings({
      apiKey: llm.apiKey,
      model: llm.modelName,
      batchSize: 1,
      configuration: { baseURL: llm.baseUrl },
    });
    const vector = await embeddings.embedQuery("connection test");
    return `Embedding 测试成功，模型 ${llm.modelName}，维度 ${vector.length}`;
  }

  private async testChat(llm: Llm, prompt: string) {
    const response = await this.createChatModel(llm, {
      maxRetries: 0,
      temperature: 0,
    }).invoke([["human", prompt]]);
    const text = extractMessageText(response);
    return text ? `调用成功：${text.slice(0, 200)}` : "调用成功";
  }

  private async testRerank(llm: Llm) {
    const response = await fetch(resolveRerankEndpoint(llm.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${llm.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: llm.modelName,
        query: "什么是登录接口",
        documents: [
          "登录接口用于用户认证并返回访问令牌。",
          "字体子集化可以减少 PDF 文件体积。",
        ],
        top_n: 2,
        instruct: DEFAULT_RERANK_INSTRUCT,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Rerank 调用失败：${response.status} ${await response.text()}`,
      );
    }

    return `Rerank 测试成功，模型 ${llm.modelName}`;
  }
}
