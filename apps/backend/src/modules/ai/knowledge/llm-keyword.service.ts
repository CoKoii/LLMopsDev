import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { LlmUsageType } from "../llm/entities/llm.entity";
import { LlmService } from "../llm/llm.service";

const DocumentKeywordsSchema = z
  .object({
    keywords: z.array(z.string().min(1).max(40)).max(20),
  })
  .strict();

const ChunkKeywordsBatchSchema = z
  .object({
    chunks: z
      .array(
        z.object({
          chunkIndex: z.number().describe("片段序号，必须与输入一致"),
          keywords: z.array(z.string().min(1).max(40)).min(1).max(6),
        }),
      )
      .describe("为每个片段生成的关键词"),
  })
  .strict();

const DOCUMENT_KEYWORD_SYSTEM_PROMPT = [
  "你是知识库检索关键词专家，负责为文档生成用户最可能使用的检索关键词。",
  "优先提取：专有名词、系统/模块/产品名称、缩写、别名、技术术语、领域概念、接口/表名等。",
  "不要提取：通用词（如“系统、平台、实现、设计、方法、相关、研究”）、章节序号、页码、文件名。",
  "关键词必须简短（2-20字）、独立完整、可直接作为搜索词；去重后按重要程度排序。",
  "输出最多 20 个关键词。",
].join("\n");

const CHUNK_KEYWORD_SYSTEM_PROMPT = [
  "你是知识库检索关键词专家，为给定的多个文档片段批量生成检索关键词。",
  "每个片段输出 1-6 个关键词，必须与片段内容强相关。",
  "优先提取：专有名词、缩写、别名、技术术语、接口/字段/表名等精确词汇。",
  "可以包含片段正文中没有出现、但用户可能用来搜索的同义词、别名、上位概念。",
  "不要提取：通用词（如“系统、平台、实现、设计、方法、问题、功能、内容、文档”）、章节序号、页码。",
  "关键词必须简短（2-20字）、独立完整、可直接作为搜索词；按重要程度排序。",
].join("\n");

type StructuredOutputWithRaw<T> = { parsed: T; raw: unknown };

const compactForPrompt = (value: string) => value.replace(/\s+/g, " ").trim();

const CHUNK_KEYWORD_BATCH_SIZE = 8;
const CHUNK_KEYWORD_MAX_CHUNKS = 300;
const CHUNK_PROMPT_TEXT_LIMIT = 900;

@Injectable()
export class LlmKeywordService {
  private readonly logger = new Logger(LlmKeywordService.name);

  constructor(private readonly llmService: LlmService) {}

  private createStructuredModel() {
    return this.llmService.createDefaultChatModel(LlmUsageType.STRUCTURED, {
      maxRetries: 0,
      temperature: 0,
    });
  }

  async extractDocumentKeywords(input: {
    title: string;
    summary: string;
    headings: string[];
  }): Promise<string[]> {
    const model = await this.createStructuredModel();
    const structuredModel = model.withStructuredOutput(DocumentKeywordsSchema, {
      name: "DocumentKeywords",
      includeRaw: true,
    });
    const response = (await structuredModel.invoke([
      ["system", DOCUMENT_KEYWORD_SYSTEM_PROMPT],
      [
        "human",
        [
          `标题：${compactForPrompt(input.title) || "（无）"}`,
          `摘要：${compactForPrompt(input.summary) || "（无）"}`,
          `章节标题：${
            input.headings
              .map(compactForPrompt)
              .filter(Boolean)
              .slice(0, 80)
              .join("、") || "（无）"
          }`,
        ].join("\n"),
      ],
    ])) as unknown as StructuredOutputWithRaw<
      z.infer<typeof DocumentKeywordsSchema>
    >;

    return [
      ...new Set(
        response.parsed.keywords.map(compactForPrompt).filter(Boolean),
      ),
    ].slice(0, 20);
  }

  async extractChunkKeywordsBatch(
    inputs: Array<{
      chunkIndex: number;
      headingPath: string[];
      text: string;
    }>,
  ): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    if (!inputs.length) return result;
    if (inputs.length > CHUNK_KEYWORD_MAX_CHUNKS) {
      this.logger.warn(
        `片段数量 ${inputs.length} 超过 ${CHUNK_KEYWORD_MAX_CHUNKS}，跳过模型关键词生成，保留规则版`,
      );
      return result;
    }

    for (
      let start = 0;
      start < inputs.length;
      start += CHUNK_KEYWORD_BATCH_SIZE
    ) {
      const batch = inputs.slice(start, start + CHUNK_KEYWORD_BATCH_SIZE);
      try {
        const model = await this.createStructuredModel();
        const structuredModel = model.withStructuredOutput(
          ChunkKeywordsBatchSchema,
          { name: "ChunkKeywordsBatch", includeRaw: true },
        );
        const response = (await structuredModel.invoke([
          ["system", CHUNK_KEYWORD_SYSTEM_PROMPT],
          [
            "human",
            batch
              .map((input) =>
                [
                  `片段 ${input.chunkIndex}:`,
                  input.headingPath.length
                    ? `章节路径：${input.headingPath.join(" > ")}`
                    : "",
                  `内容：${compactForPrompt(input.text).slice(0, CHUNK_PROMPT_TEXT_LIMIT)}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              )
              .join("\n\n"),
          ],
        ])) as unknown as StructuredOutputWithRaw<
          z.infer<typeof ChunkKeywordsBatchSchema>
        >;

        for (const item of response.parsed.chunks) {
          result.set(
            item.chunkIndex,
            [
              ...new Set(item.keywords.map(compactForPrompt).filter(Boolean)),
            ].slice(0, 6),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `片段关键词批量生成失败 chunkIndex=${batch[0]?.chunkIndex}~${
            batch[batch.length - 1]?.chunkIndex
          }，保留规则版：${message}`,
        );
      }
    }

    return result;
  }
}
