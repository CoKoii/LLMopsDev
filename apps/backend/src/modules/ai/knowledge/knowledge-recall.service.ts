import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import { RecallTestDto } from "./dto/recall-test.dto";
import { KnowledgeDocumentChunk } from "./entities/knowledge-document-chunk.entity";
import { KnowledgeDocument } from "./entities/knowledge-document.entity";
import { Knowledge } from "./entities/knowledge.entity";

interface RecallMatch {
  chunkId: number;
  score: number;
  source: "vector" | "text" | "hybrid";
  vectorScore?: number;
  textScore?: number;
}

type KnowledgeRecallStrategy = "hybrid" | "vector" | "text";

export interface AppKnowledgeRecallSettings {
  strategy?: KnowledgeRecallStrategy;
  limit?: number;
  minScore?: number;
}

export interface AppKnowledgeRecallItem {
  knowledgeId: number;
  knowledgeName: string;
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  score: number;
  source: KnowledgeRecallStrategy;
  text: string;
  searchText: string;
  metadata: Record<string, unknown>;
}

type KnowledgeRecallResultItem = Omit<
  AppKnowledgeRecallItem,
  "knowledgeId" | "knowledgeName"
> & {
  source: KnowledgeRecallStrategy;
};

type KnowledgeRecallExecutionOptions = {
  queryVector?: number[];
};

const clampScore = (score: number) =>
  Math.max(0, Math.min(1, Number(score.toFixed(4))));

const escapeLikeValue = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const normalizeRecallText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const uniqueStrings = (items: string[]) => [...new Set(items)];

const extractRecallTerms = (query: string) => {
  const normalizedQuery = normalizeRecallText(query);
  const terms: string[] = [];

  terms.push(
    ...Array.from(
      normalizedQuery.matchAll(/[A-Za-z][A-Za-z0-9_./+-]{1,}/g),
      (match) => match[0].toLowerCase(),
    ),
  );

  for (const match of normalizedQuery.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const word = match[0];
    if (word.length <= 6) terms.push(word);

    for (let index = 0; index <= word.length - 2; index += 1) {
      terms.push(word.slice(index, index + 2));
    }
  }

  return uniqueStrings(
    terms.map((term) => term.trim()).filter((term) => term.length >= 2),
  );
};

const limitRecallTerms = (terms: string[]) => terms.slice(0, 16);

const recallTermWeight = (term: string) =>
  /[\u3400-\u9fff]/.test(term)
    ? Math.min(term.length, 6)
    : Math.min(Math.ceil(term.length / 2), 6);

const looksLikeMetadataBlock = (text: string) =>
  /^\s*[A-Za-z][\w.-]{1,40}\s*:/u.test(text);

@Injectable()
export class KnowledgeRecallService {
  private readonly logger = new Logger(KnowledgeRecallService.name);

  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeDocumentChunk)
    private readonly chunkRepository: Repository<KnowledgeDocumentChunk>,
    private readonly documentEmbeddingService: DocumentEmbeddingService,
    private readonly documentVectorStoreService: DocumentVectorStoreService,
  ) {}

  async recallTest(knowledgeId: number, dto: RecallTestDto) {
    const query = dto.query.trim();
    if (!query) throw new BadRequestException("检索文本不能为空");

    const { strategy, limit, minScore, items } = await this.executeRecall(
      knowledgeId,
      query,
      dto,
    );
    await this.incrementRecallCounts(knowledgeId, items);

    return {
      query,
      strategy,
      limit,
      minScore,
      items,
    };
  }

  async recallForApp(params: {
    knowledgeIds: number[];
    settings?: AppKnowledgeRecallSettings;
    query: string;
    userId: number;
  }): Promise<AppKnowledgeRecallItem[]> {
    const query = params.query.trim();
    if (!query || !params.knowledgeIds.length) return [];

    const knowledgeIds = [...new Set(params.knowledgeIds)].slice(0, 5);
    const knowledges = await this.knowledgeRepository.find({
      where: {
        id: In(knowledgeIds),
        createdBy: params.userId,
        status: true,
      },
    });
    const knowledgeMap = new Map(knowledges.map((item) => [item.id, item]));
    const accessibleKnowledgeIds = knowledgeIds.filter((knowledgeId) =>
      knowledgeMap.has(knowledgeId),
    );
    const { strategy, limit } = this.normalizeRecallSettings(params.settings);
    const needsQueryVector =
      accessibleKnowledgeIds.length > 0 &&
      (strategy === "hybrid" || strategy === "vector");
    const queryVector = needsQueryVector
      ? await this.createQueryVector(query)
      : undefined;
    const results = (
      await Promise.all(
        accessibleKnowledgeIds.map(async (knowledgeId) => {
          const knowledge = knowledgeMap.get(knowledgeId);
          if (!knowledge) return [];

          const recallResult = await this.executeRecall(
            knowledgeId,
            query,
            params.settings,
            { queryVector },
          );
          this.scheduleRecallCountIncrement(knowledgeId, recallResult.items);

          return recallResult.items.map((item) => ({
            ...item,
            knowledgeId,
            knowledgeName: knowledge.name,
          }));
        }),
      )
    ).flat();

    return results
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  private async createQueryVector(query: string) {
    const embeddingResult = await this.documentEmbeddingService.embed([query]);
    return embeddingResult.vectors[0] ?? [];
  }

  private async searchVectorRecall(
    knowledgeId: number,
    query: string,
    limit: number,
    minScore: number,
    queryVector?: number[],
  ): Promise<RecallMatch[]> {
    const vector = queryVector ?? (await this.createQueryVector(query));
    const points = await this.documentVectorStoreService.search({
      vector,
      knowledgeId,
      limit,
      scoreThreshold: minScore || undefined,
    });

    return points.map((point) => ({
      chunkId: point.payload.chunkId,
      score: point.score,
      vectorScore: point.score,
      source: "vector",
    }));
  }

  private async searchTextRecall(
    knowledgeId: number,
    query: string,
    limit: number,
    minScore: number,
  ): Promise<RecallMatch[]> {
    const terms = limitRecallTerms(extractRecallTerms(query));
    if (!terms.length) return [];

    const params = Object.fromEntries(
      terms.map((term, index) => [
        `term${index}`,
        `%${escapeLikeValue(term)}%`,
      ]),
    );
    const rankExpression = terms
      .map(
        (term, index) =>
          `CASE WHEN LOWER(chunk.searchText) LIKE :term${index} THEN ${recallTermWeight(term)} ELSE 0 END`,
      )
      .join(" + ");
    const chunks = await this.chunkRepository
      .createQueryBuilder("chunk")
      .innerJoin("chunk.document", "document")
      .where("chunk.knowledgeId = :knowledgeId", { knowledgeId })
      .andWhere("chunk.enabled = :chunkEnabled", { chunkEnabled: true })
      .andWhere("document.enabled = :enabled", { enabled: true })
      .andWhere(
        `(${terms
          .map((_, index) => `LOWER(chunk.searchText) LIKE :term${index}`)
          .join(" OR ")})`,
        params,
      )
      .addSelect(`(${rankExpression})`, "lexical_rank")
      .orderBy("lexical_rank", "DESC")
      .addOrderBy("chunk.id", "DESC")
      .take(limit)
      .getMany();

    return chunks
      .map((chunk) => ({
        chunk,
        score: this.calculateRecallLexicalScore(query, chunk),
      }))
      .sort((left, right) => right.score - left.score)
      .map(({ chunk, score }) => {
        return {
          chunkId: chunk.id,
          score,
          textScore: score,
          source: "text" as const,
        };
      })
      .filter((item) => item.score >= minScore);
  }

  private calculateRecallLexicalScore(
    query: string,
    chunk: KnowledgeDocumentChunk,
  ) {
    const terms = extractRecallTerms(query);
    if (!terms.length) return 0;

    const text = normalizeRecallText(chunk.searchText || chunk.text);
    const headingText = normalizeRecallText(
      (chunk.metadata.headingPath ?? []).join(" "),
    );
    let matchedWeight = 0;
    let totalWeight = 0;

    for (const term of terms) {
      const weight = recallTermWeight(term);
      totalWeight += weight;

      if (text.includes(term)) {
        matchedWeight += weight;
        continue;
      }
      if (headingText.includes(term)) {
        matchedWeight += weight * 0.65;
      }
    }

    const effectiveTotalWeight = Math.min(totalWeight, 10);
    return effectiveTotalWeight
      ? Math.min(1, matchedWeight / effectiveTotalWeight)
      : 0;
  }

  private calculateRecallRankScore(
    query: string,
    match: RecallMatch,
    chunk: KnowledgeDocumentChunk,
  ) {
    const lexicalScore = this.calculateRecallLexicalScore(query, chunk);
    const blockTypes = chunk.metadata.blockTypes ?? [];
    const isCodeOnly =
      blockTypes.length > 0 && blockTypes.every((type) => type === "code");
    const metadataPenalty = looksLikeMetadataBlock(chunk.text) ? 0.22 : 0;
    const shortTextPenalty = chunk.text.length < 60 ? 0.06 : 0;
    const codePenalty = isCodeOnly && lexicalScore < 0.6 ? 0.12 : 0;
    const vectorScore = match.vectorScore ?? 0;
    const textScore = match.textScore ?? lexicalScore;
    const baseScore = vectorScore ? vectorScore + textScore * 0.04 : textScore;

    return baseScore - metadataPenalty - shortTextPenalty - codePenalty;
  }

  private mergeRecallMatches(matches: RecallMatch[], limit: number) {
    const matchMap = new Map<number, RecallMatch>();

    for (const match of matches) {
      const existing = matchMap.get(match.chunkId);
      if (!existing) {
        matchMap.set(match.chunkId, match);
        continue;
      }

      matchMap.set(match.chunkId, {
        chunkId: match.chunkId,
        score: Math.max(existing.score, match.score),
        source: existing.source === match.source ? match.source : "hybrid",
        vectorScore: Math.max(
          existing.vectorScore ?? 0,
          match.vectorScore ?? 0,
        ),
        textScore: Math.max(existing.textScore ?? 0, match.textScore ?? 0),
      });
    }

    return [...matchMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private normalizeRecallSettings(settings: AppKnowledgeRecallSettings = {}) {
    const strategy = settings.strategy ?? "hybrid";
    const limit = Math.min(20, Math.max(1, Math.floor(settings.limit ?? 5)));
    const minScore = Math.min(1, Math.max(0, settings.minScore ?? 0.4));

    return { strategy, limit, minScore };
  }

  private async executeRecall(
    knowledgeId: number,
    query: string,
    settings: AppKnowledgeRecallSettings = {},
    options: KnowledgeRecallExecutionOptions = {},
  ) {
    const { strategy, limit, minScore } =
      this.normalizeRecallSettings(settings);
    const recallLimit =
      strategy === "vector" ? limit : Math.min(200, Math.max(limit * 12, 60));
    const recallTasks: Array<Promise<RecallMatch[]>> = [];

    if (strategy === "hybrid" || strategy === "vector") {
      recallTasks.push(
        this.searchVectorRecall(
          knowledgeId,
          query,
          recallLimit,
          minScore,
          options.queryVector,
        ),
      );
    }

    if (strategy === "hybrid" || strategy === "text") {
      recallTasks.push(
        this.searchTextRecall(knowledgeId, query, recallLimit, minScore),
      );
    }

    const matches = (await Promise.all(recallTasks)).flat();
    const mergedMatches = this.mergeRecallMatches(matches, recallLimit);
    const chunks = mergedMatches.length
      ? await this.chunkRepository.find({
          where: {
            id: In(mergedMatches.map((item) => item.chunkId)),
            knowledgeId,
          },
          relations: { document: true },
        })
      : [];
    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const items = mergedMatches
      .map((match) => {
        const chunk = chunkMap.get(match.chunkId);
        if (!chunk?.enabled || !chunk.document?.enabled) return undefined;
        const rankScore = this.calculateRecallRankScore(query, match, chunk);

        return {
          rankScore,
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: chunk.document.name,
          chunkIndex: chunk.chunkIndex,
          score: clampScore(rankScore),
          source: match.source,
          text: chunk.text,
          searchText: chunk.searchText,
          metadata: chunk.metadata as unknown as Record<string, unknown>,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.rankScore - left.rankScore)
      .slice(0, limit)
      .map((item) => ({
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentName: item.documentName,
        chunkIndex: item.chunkIndex,
        score: item.score,
        source: item.source,
        text: item.text,
        searchText: item.searchText,
        metadata: item.metadata,
      }));

    return {
      strategy,
      limit,
      minScore,
      items,
    };
  }

  private async incrementRecallCounts(
    knowledgeId: number,
    items: Array<Pick<KnowledgeRecallResultItem, "documentId" | "chunkId">>,
  ) {
    const documentIds = [...new Set(items.map((item) => item.documentId))];
    if (documentIds.length) {
      await this.documentRepository.increment(
        { id: In(documentIds), knowledgeId },
        "recallCount",
        1,
      );
    }
    const chunkIds = items.map((item) => item.chunkId);
    if (chunkIds.length) {
      await this.chunkRepository.increment(
        { id: In(chunkIds), knowledgeId },
        "recallCount",
        1,
      );
    }
  }

  private scheduleRecallCountIncrement(
    knowledgeId: number,
    items: Array<Pick<KnowledgeRecallResultItem, "documentId" | "chunkId">>,
  ) {
    if (!items.length) return;

    void this.incrementRecallCounts(knowledgeId, items).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.warn(`知识库召回次数更新失败: ${message}`, stack);
    });
  }
}
