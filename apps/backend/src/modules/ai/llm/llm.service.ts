import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { DataSource, Not, Repository, type SelectQueryBuilder } from "typeorm";
import WebSocket, { type RawData } from "ws";
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

export type SpeechAudioChunk = {
  buffer: Buffer;
  contentType: string;
};

const trimTrailingSlash = (value: string) => value.trim().replace(/\/+$/, "");
const resolveAudioEndpoint = (baseUrl: string, path: string) =>
  `${trimTrailingSlash(baseUrl)}${path}`;
const isWebSocketUrl = (value: string) => /^wss?:\/\//i.test(value.trim());
const isDashScopeMultimodalGenerationUrl = (value: string) =>
  value.includes("/multimodal-generation/generation");
const assertHttpAudioEndpoint = (llm: Llm) => {
  if (!isWebSocketUrl(llm.baseUrl)) return;
  throw new BadRequestException(
    `${llm.usageType}模型配置的是 WebSocket 地址，当前语音功能只支持 HTTP/OpenAI-compatible 音频接口；请配置 https 地址，或先实现 WebSocket 实时语音协议`,
  );
};
const AUDIO_WEBSOCKET_TIMEOUT_MS = 30_000;
const TTS_STREAM_IDLE_TIMEOUT_MS = 45_000;
const ASR_TEST_SILENCE = Buffer.alloc(32_000);
const TTS_FINISH_DELAY_MS = 500;
const TTS_STREAM_SEGMENT_MIN_CHARS = 18;
const TTS_STREAM_SEGMENT_MAX_CHARS = 80;
const DEFAULT_TTS_SPEECH_RATE = 120;
const DEFAULT_TTS_SPEED = 1.15;
const DEFAULT_QWEN_AUDIO_TTS_PLUS_VOICE = "longanlingxin";
const DEFAULT_QWEN_AUDIO_TTS_FLASH_VOICE = "longanhuan_v3.6";
const DEFAULT_COSYVOICE_V3_VOICE = "longanyang";
const DEFAULT_OPENAI_VOICE = "alloy";
const QWEN_AUDIO_TTS_PLUS_VOICES = new Set(["longanlingxin", "longanlufeng"]);
const QWEN_AUDIO_TTS_FLASH_VOICES = new Set([
  "longanhuan_v3.6",
  "longjielidou_v3.6",
  "loongeva_v3.6",
  "loongjohn",
]);

type WebSocketEventMessage = {
  header?: {
    event?: string;
    error_code?: string;
    error_message?: string;
  };
  payload?: {
    output?: {
      sentence?: {
        heartbeat?: boolean;
        sentence_end?: boolean;
        text?: string;
      };
    };
  };
};

type DashScopeAsrResponse = {
  text?: unknown;
  sentence?: {
    text?: unknown;
  };
  output?: {
    text?: unknown;
    sentence?: {
      text?: unknown;
    };
  };
};

const toBuffer = (data: RawData) => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
};

const parseWebSocketMessage = (data: RawData) => {
  try {
    return JSON.parse(toBuffer(data).toString("utf8")) as WebSocketEventMessage;
  } catch {
    return undefined;
  }
};

const resolveAsrAudioFormat = (contentType: string, filename: string) => {
  const value = `${contentType} ${filename}`.toLowerCase();
  if (value.includes("mp3") || value.endsWith(".mp3")) {
    return { format: "mp3", sampleRate: 44_100 };
  }
  if (value.includes("wav") || value.endsWith(".wav")) {
    return { format: "wav", sampleRate: 16_000 };
  }
  if (value.includes("aac") || value.endsWith(".aac")) {
    return { format: "aac", sampleRate: 44_100 };
  }
  if (value.includes("amr") || value.endsWith(".amr")) {
    return { format: "amr", sampleRate: 8_000 };
  }
  if (value.includes("speex") || value.endsWith(".spx")) {
    return { format: "speex", sampleRate: 16_000 };
  }
  if (
    value.includes("opus") ||
    value.includes("ogg") ||
    value.includes("webm")
  ) {
    return { format: "opus", sampleRate: 48_000 };
  }
  return { format: "pcm", sampleRate: 16_000 };
};

const createAudioDataUri = (contentType: string, buffer: Buffer) => {
  const mimeType = contentType.split(";")[0]?.trim() || "audio/wav";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

const extractAsrText = (payload: DashScopeAsrResponse) => {
  const candidates = [
    payload.text,
    payload.output?.text,
    payload.sentence?.text,
    payload.output?.sentence?.text,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const parseLlmRemarkOptions = (remark?: string | null) => {
  const text = remark?.trim();
  if (!text) return {};

  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Fallback to key=value lines below.
  }

  return Object.fromEntries(
    text
      .split(/\r?\n|;/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.search(/[:=：]/);
        if (separatorIndex < 0) return undefined;
        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim(),
        ] as const;
      })
      .filter((item): item is readonly [string, string] => Boolean(item)),
  );
};

const getOptionString = (options: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const resolveSpeechVoice = (llm: Llm, voice?: string) => {
  const configuredRequestVoice = voice?.trim();
  const modelName = llm.modelName.toLowerCase();
  if (configuredRequestVoice) {
    if (
      modelName.includes("qwen-audio-3.0-tts-plus") &&
      QWEN_AUDIO_TTS_FLASH_VOICES.has(configuredRequestVoice)
    ) {
      throw new BadRequestException(
        `当前语音合成模型 ${llm.modelName} 不支持 flash 音色 ${configuredRequestVoice}，请使用 plus 音色 longanlingxin、longanlufeng，或在模型备注中配置对应模型的基础/复刻音色`,
      );
    }
    if (
      modelName.includes("qwen-audio-3.0-tts-flash") &&
      QWEN_AUDIO_TTS_PLUS_VOICES.has(configuredRequestVoice)
    ) {
      throw new BadRequestException(
        `当前语音合成模型 ${llm.modelName} 不支持 plus 音色 ${configuredRequestVoice}，请使用 flash 音色 longanhuan_v3.6、longjielidou_v3.6、loongeva_v3.6、loongjohn，或在模型备注中配置对应模型的基础/复刻音色`,
      );
    }
    return configuredRequestVoice;
  }

  const options = parseLlmRemarkOptions(llm.remark);
  const configuredVoice = getOptionString(options, ["voice", "音色"]);
  if (configuredVoice) return configuredVoice;

  if (modelName.includes("cosyvoice-v3.5")) {
    throw new BadRequestException(
      "CosyVoice v3.5 没有系统音色，请先在百炼创建声音设计/声音复刻音色，并在模型备注中填写 voice=音色ID",
    );
  }
  if (modelName.includes("qwen-audio-3.0-tts-plus")) {
    return DEFAULT_QWEN_AUDIO_TTS_PLUS_VOICE;
  }
  if (modelName.includes("qwen-audio-3.0-tts-flash")) {
    return DEFAULT_QWEN_AUDIO_TTS_FLASH_VOICE;
  }
  if (modelName.includes("qwen-audio"))
    return DEFAULT_QWEN_AUDIO_TTS_FLASH_VOICE;
  if (modelName.includes("cosyvoice-v3")) return DEFAULT_COSYVOICE_V3_VOICE;
  if (modelName.includes("qwen")) return "Cherry";
  return DEFAULT_OPENAI_VOICE;
};

const normalizeMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const findSpeechSegmentEnd = (text: string) => {
  const sentenceEndPattern = /[。！？.!?]\s*/gu;
  let match: RegExpExecArray | null;
  let endIndex = -1;
  while ((match = sentenceEndPattern.exec(text))) {
    endIndex = match.index + match[0].length;
  }
  if (endIndex >= TTS_STREAM_SEGMENT_MIN_CHARS) return endIndex;
  if (text.length < TTS_STREAM_SEGMENT_MAX_CHARS) return -1;

  const softBreaks = ["，", "、", ",", ";", "；", "\n"];
  const searchStart = Math.floor(TTS_STREAM_SEGMENT_MAX_CHARS / 2);
  const windowText = text.slice(searchStart, TTS_STREAM_SEGMENT_MAX_CHARS);
  const softIndex = Math.max(
    ...softBreaks.map((item) => windowText.lastIndexOf(item)),
  );
  if (softIndex >= 0) return searchStart + softIndex + 1;

  return TTS_STREAM_SEGMENT_MAX_CHARS;
};

async function* createSpeechTextSegments(input: AsyncIterable<string>) {
  let buffer = "";

  for await (const chunk of input) {
    buffer += chunk;
    for (;;) {
      const endIndex = findSpeechSegmentEnd(buffer);
      if (endIndex < 0) break;

      const text = buffer.slice(0, endIndex).trim();
      buffer = buffer.slice(endIndex);
      if (text) yield text;
    }
  }

  const tail = buffer.trim();
  if (tail) yield tail;
}

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
  LlmUsageType.SPEECH_TO_TEXT,
  LlmUsageType.TEXT_TO_SPEECH,
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

  async transcribeAudio(params: {
    buffer: Buffer;
    contentType: string;
    filename: string;
  }) {
    const llm = await this.resolveEnabledSystemModel(
      LlmUsageType.SPEECH_TO_TEXT,
    );
    if (isWebSocketUrl(llm.baseUrl)) {
      return this.transcribeAudioByWebSocket(llm, params);
    }
    assertHttpAudioEndpoint(llm);

    if (isDashScopeMultimodalGenerationUrl(llm.baseUrl)) {
      return this.transcribeAudioByDashScope(llm, params);
    }

    const formData = new FormData();
    formData.append("model", llm.modelName);
    formData.append(
      "file",
      new File([new Uint8Array(params.buffer)], params.filename, {
        type: params.contentType,
      }),
    );

    const response = await fetch(
      resolveAudioEndpoint(llm.baseUrl, "/audio/transcriptions"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${llm.apiKey}`,
        },
        body: formData,
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `语音识别调用失败：${response.status} ${responseText}`,
      );
    }

    try {
      const payload = JSON.parse(responseText) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (text) return { text };
    } catch {
      const text = responseText.trim();
      if (text) return { text };
    }

    throw new BadGatewayException("语音识别调用失败：返回内容为空");
  }

  private async transcribeAudioByDashScope(
    llm: Llm,
    params: {
      buffer: Buffer;
      contentType: string;
      filename: string;
    },
  ) {
    const { format, sampleRate } = resolveAsrAudioFormat(
      params.contentType,
      params.filename,
    );
    const response = await fetch(trimTrailingSlash(llm.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${llm.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: llm.modelName,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  input_audio: {
                    data: createAudioDataUri(params.contentType, params.buffer),
                  },
                },
              ],
            },
          ],
        },
        parameters: {
          format,
          sample_rate: sampleRate,
        },
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `语音识别调用失败：${response.status} ${responseText}`,
      );
    }

    try {
      const payload = JSON.parse(responseText) as DashScopeAsrResponse;
      const text = extractAsrText(payload);
      if (text) return { text };
    } catch {
      const text = responseText.trim();
      if (text) return { text };
    }

    throw new BadGatewayException("语音识别调用失败：返回内容为空");
  }

  async synthesizeSpeech(text: string, voice?: string) {
    const llm = await this.resolveEnabledSystemModel(
      LlmUsageType.TEXT_TO_SPEECH,
    );
    if (isWebSocketUrl(llm.baseUrl)) {
      return this.synthesizeSpeechByWebSocket(llm, text, voice);
    }
    assertHttpAudioEndpoint(llm);
    const response = await fetch(
      resolveAudioEndpoint(llm.baseUrl, "/audio/speech"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${llm.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: llm.modelName,
          input: text,
          voice: resolveSpeechVoice(llm, voice),
          response_format: "mp3",
          speed: DEFAULT_TTS_SPEED,
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `语音合成调用失败：${response.status} ${await response.text()}`,
      );
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "audio/mpeg",
    };
  }

  async *streamSynthesizeSpeech(text: AsyncIterable<string>, voice?: string) {
    const llm = await this.resolveEnabledSystemModel(
      LlmUsageType.TEXT_TO_SPEECH,
    );
    if (!isWebSocketUrl(llm.baseUrl)) {
      const chunks: string[] = [];
      for await (const chunk of text) chunks.push(chunk);
      if (!chunks.join("").trim()) return;

      yield await this.synthesizeSpeech(chunks.join(""), voice);
      return;
    }

    yield* this.streamSynthesizeSpeechByWebSocket(llm, text, voice);
  }

  private createAudioWebSocket(llm: Llm) {
    return new WebSocket(trimTrailingSlash(llm.baseUrl), {
      headers: {
        Authorization: `bearer ${llm.apiKey}`,
        "X-DashScope-DataInspection": "enable",
      },
    });
  }

  private transcribeAudioByWebSocket(
    llm: Llm,
    params: {
      buffer: Buffer;
      contentType: string;
      filename: string;
    },
  ) {
    const { format, sampleRate } = resolveAsrAudioFormat(
      params.contentType,
      params.filename,
    );
    return new Promise<{ text: string }>((resolve, reject) => {
      const taskId = randomUUID();
      const texts: string[] = [];
      let settled = false;
      let taskStarted = false;
      const ws = this.createAudioWebSocket(llm);
      const timer = setTimeout(() => {
        finish(new BadGatewayException("语音识别调用超时"));
      }, AUDIO_WEBSOCKET_TIMEOUT_MS);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (error) {
          reject(error);
          return;
        }
        const text = texts.join("").trim();
        if (!text) {
          reject(new BadGatewayException("语音识别调用失败：未返回识别文本"));
          return;
        }
        resolve({ text });
      };

      const sendJson = (payload: unknown) => {
        ws.send(JSON.stringify(payload));
      };

      ws.on("open", () => {
        sendJson({
          header: {
            action: "run-task",
            task_id: taskId,
            streaming: "duplex",
          },
          payload: {
            task_group: "audio",
            task: "asr",
            function: "recognition",
            model: llm.modelName,
            parameters: {
              format,
              sample_rate: sampleRate,
            },
            input: {},
          },
        });
      });

      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const message = parseWebSocketMessage(data);
        const event = message?.header?.event;

        if (event === "task-started" && !taskStarted) {
          taskStarted = true;
          ws.send(params.buffer);
          sendJson({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: {} },
          });
          return;
        }

        if (event === "result-generated") {
          const sentence = message?.payload?.output?.sentence;
          const text = sentence?.text?.trim();
          if (text && sentence?.sentence_end && !sentence.heartbeat) {
            texts.push(text);
          }
          return;
        }

        if (event === "task-finished") {
          finish();
          return;
        }

        if (event === "task-failed") {
          finish(
            new BadGatewayException(
              `语音识别调用失败：${message?.header?.error_code ?? ""} ${
                message?.header?.error_message ?? ""
              }`.trim(),
            ),
          );
        }
      });

      ws.on("error", (error) => {
        finish(
          new BadGatewayException(
            `语音识别 WebSocket 连接失败：${error.message}`,
          ),
        );
      });
    });
  }

  private synthesizeSpeechByWebSocket(llm: Llm, text: string, voice?: string) {
    return new Promise<{ buffer: Buffer; contentType: string }>(
      (resolve, reject) => {
        const taskId = randomUUID();
        const chunks: Buffer[] = [];
        let settled = false;
        let textSent = false;
        const ws = this.createAudioWebSocket(llm);
        const timer = setTimeout(() => {
          finish(new BadGatewayException("语音合成调用超时"));
        }, AUDIO_WEBSOCKET_TIMEOUT_MS);

        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.close();
          if (error) {
            reject(error);
            return;
          }
          if (!chunks.length) {
            reject(new BadGatewayException("语音合成调用失败：未返回音频"));
            return;
          }
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: "audio/mpeg",
          });
        };

        const sendJson = (payload: unknown) => {
          ws.send(JSON.stringify(payload));
        };

        ws.on("open", () => {
          sendJson({
            header: {
              action: "run-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: {
              task_group: "audio",
              task: "tts",
              function: "SpeechSynthesizer",
              model: llm.modelName,
              parameters: {
                text_type: "PlainText",
                voice: resolveSpeechVoice(llm, voice),
                format: "mp3",
                speech_rate: DEFAULT_TTS_SPEECH_RATE,
                enable_ssml: false,
              },
              input: {},
            },
          });
        });

        ws.on("message", (data, isBinary) => {
          if (isBinary) {
            chunks.push(toBuffer(data));
            return;
          }
          const message = parseWebSocketMessage(data);
          const event = message?.header?.event;

          if (event === "task-started" && !textSent) {
            textSent = true;
            sendJson({
              header: {
                action: "continue-task",
                task_id: taskId,
                streaming: "duplex",
              },
              payload: {
                input: { text },
              },
            });
            void wait(TTS_FINISH_DELAY_MS).then(() => {
              if (settled) return;
              sendJson({
                header: {
                  action: "finish-task",
                  task_id: taskId,
                  streaming: "duplex",
                },
                payload: { input: {} },
              });
            });
            return;
          }

          if (event === "task-finished") {
            finish();
            return;
          }

          if (event === "task-failed") {
            finish(
              new BadGatewayException(
                `语音合成调用失败：${message?.header?.error_code ?? ""} ${
                  message?.header?.error_message ?? ""
                }`.trim(),
              ),
            );
          }
        });

        ws.on("error", (error) => {
          finish(
            new BadGatewayException(
              `语音合成 WebSocket 连接失败：${error.message}`,
            ),
          );
        });
      },
    );
  }

  private streamSynthesizeSpeechByWebSocket(
    llm: Llm,
    text: AsyncIterable<string>,
    voice?: string,
  ) {
    const taskId = randomUUID();
    const contentType = "audio/mpeg";
    const stream = new ReadableStream<SpeechAudioChunk>({
      start: (controller) => {
        const ws = this.createAudioWebSocket(llm);
        let settled = false;
        let taskStarted = false;
        let inputFinished = false;
        let timer: NodeJS.Timeout;
        const refreshTimeout = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            finish(new BadGatewayException("语音合成空闲超时"));
          }, TTS_STREAM_IDLE_TIMEOUT_MS);
        };
        refreshTimeout();

        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.close();
          if (error) {
            controller.error(error);
            return;
          }
          controller.close();
        };

        const sendJson = (payload: unknown) => {
          refreshTimeout();
          ws.send(JSON.stringify(payload));
        };

        const finishTask = () => {
          if (inputFinished || settled) return;
          inputFinished = true;
          sendJson({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: {} },
          });
        };

        const pumpText = async () => {
          try {
            for await (const segment of createSpeechTextSegments(text)) {
              if (settled) return;
              sendJson({
                header: {
                  action: "continue-task",
                  task_id: taskId,
                  streaming: "duplex",
                },
                payload: {
                  input: { text: segment },
                },
              });
            }
            void wait(TTS_FINISH_DELAY_MS).then(finishTask);
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new BadGatewayException(String(error)),
            );
          }
        };

        ws.on("open", () => {
          sendJson({
            header: {
              action: "run-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: {
              task_group: "audio",
              task: "tts",
              function: "SpeechSynthesizer",
              model: llm.modelName,
              parameters: {
                text_type: "PlainText",
                voice: resolveSpeechVoice(llm, voice),
                format: "mp3",
                speech_rate: DEFAULT_TTS_SPEECH_RATE,
                enable_ssml: false,
              },
              input: {},
            },
          });
        });

        ws.on("message", (data, isBinary) => {
          if (settled) return;
          if (isBinary) {
            refreshTimeout();
            controller.enqueue({ buffer: toBuffer(data), contentType });
            return;
          }

          refreshTimeout();
          const message = parseWebSocketMessage(data);
          const event = message?.header?.event;
          if (event === "task-started" && !taskStarted) {
            taskStarted = true;
            void pumpText();
            return;
          }
          if (event === "task-finished") {
            finish();
            return;
          }
          if (event === "task-failed") {
            finish(
              new BadGatewayException(
                `语音合成调用失败：${message?.header?.error_code ?? ""} ${
                  message?.header?.error_message ?? ""
                }`.trim(),
              ),
            );
          }
        });

        ws.on("error", (error) => {
          finish(
            new BadGatewayException(
              `语音合成 WebSocket 连接失败：${error.message}`,
            ),
          );
        });
      },
    });

    return stream.values();
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
            : llm.usageType === LlmUsageType.SPEECH_TO_TEXT
              ? await this.testSpeechToText(llm)
              : llm.usageType === LlmUsageType.TEXT_TO_SPEECH
                ? await this.testTextToSpeech(llm)
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

  private async testSpeechToText(llm: Llm) {
    if (isWebSocketUrl(llm.baseUrl)) {
      await this.testSpeechToTextByWebSocket(llm);
      return `语音识别 WebSocket 测试成功，模型 ${llm.modelName}`;
    }
    assertHttpAudioEndpoint(llm);
    return `语音识别模型配置校验通过，模型 ${llm.modelName}，运行时使用用户录音测试`;
  }

  private async testTextToSpeech(llm: Llm) {
    if (isWebSocketUrl(llm.baseUrl)) {
      await this.synthesizeSpeechByWebSocket(llm, "你好");
      return `语音合成 WebSocket 测试成功，模型 ${llm.modelName}`;
    }
    assertHttpAudioEndpoint(llm);
    const response = await fetch(
      resolveAudioEndpoint(llm.baseUrl, "/audio/speech"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${llm.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: llm.modelName,
          input: "你好",
          voice: resolveSpeechVoice(llm),
          response_format: "mp3",
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `语音合成调用失败：${response.status} ${await response.text()}`,
      );
    }

    return `语音合成测试成功，模型 ${llm.modelName}`;
  }

  private testSpeechToTextByWebSocket(llm: Llm) {
    return new Promise<void>((resolve, reject) => {
      const taskId = randomUUID();
      let settled = false;
      let taskStarted = false;
      const ws = this.createAudioWebSocket(llm);
      const timer = setTimeout(() => {
        finish(new BadGatewayException("语音识别 WebSocket 测试超时"));
      }, AUDIO_WEBSOCKET_TIMEOUT_MS);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      const sendJson = (payload: unknown) => {
        ws.send(JSON.stringify(payload));
      };

      ws.on("open", () => {
        sendJson({
          header: {
            action: "run-task",
            task_id: taskId,
            streaming: "duplex",
          },
          payload: {
            task_group: "audio",
            task: "asr",
            function: "recognition",
            model: llm.modelName,
            parameters: {
              format: "pcm",
              sample_rate: 16_000,
            },
            input: {},
          },
        });
      });

      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const message = parseWebSocketMessage(data);
        const event = message?.header?.event;

        if (event === "task-started" && !taskStarted) {
          taskStarted = true;
          ws.send(ASR_TEST_SILENCE);
          sendJson({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: {} },
          });
          return;
        }

        if (event === "task-finished") {
          finish();
          return;
        }

        if (event === "task-failed") {
          finish(
            new BadGatewayException(
              `语音识别 WebSocket 测试失败：${message?.header?.error_code ?? ""} ${
                message?.header?.error_message ?? ""
              }`.trim(),
            ),
          );
        }
      });

      ws.on("error", (error) => {
        finish(
          new BadGatewayException(
            `语音识别 WebSocket 连接失败：${error.message}`,
          ),
        );
      });
    });
  }
}
