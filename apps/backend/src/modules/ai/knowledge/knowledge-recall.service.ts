import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { Segment, useDefault } from "segmentit";
import { DataSource, In, Repository } from "typeorm";
import { DocumentEmbeddingService } from "./document-embedding/document-embedding.service";
import { DocumentRerankService } from "./document-rerank/document-rerank.service";
import { DocumentVectorStoreService } from "./document-vector-store/document-vector-store.service";
import type { DocumentChunkMetadata } from "./document-chunker/document-chunker.types";
import { RecallTestDto } from "./dto/recall-test.dto";
import { KnowledgeDocumentChunk } from "./entities/knowledge-document-chunk.entity";
import { KnowledgeDocument } from "./entities/knowledge-document.entity";
import { Knowledge } from "./entities/knowledge.entity";

type KnowledgeRecallStrategy = "hybrid" | "vector" | "text";

interface RecallMatch {
  chunkId: number;
  score: number;
  source: KnowledgeRecallStrategy;
  vectorScore?: number;
  textScore?: number;
}

interface RecallCandidate extends RecallMatch {
  chunk: KnowledgeDocumentChunk;
  rerankScore?: number;
}

interface WeightedRecallText {
  text?: string | string[];
  boost: number;
}

interface RecallAccumulator {
  chunkId: number;
  source: KnowledgeRecallStrategy;
  vectorScore: number;
  textScore: number;
}

interface TextRecallRow {
  chunkId: number | string;
  score: number | string;
}

export interface AppKnowledgeRecallSettings {
  strategy?: KnowledgeRecallStrategy;
  limit?: number;
  minScore?: number;
  vectorWeight?: number;
}

export interface AppKnowledgeRecallItem {
  knowledgeId: number;
  knowledgeName: string;
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  score: number;
  rerankScore?: number;
  vectorScore?: number;
  textScore?: number;
  source: KnowledgeRecallStrategy;
  text: string;
  searchText: string;
  metadata: Record<string, unknown>;
}

type KnowledgeRecallResultItem = Omit<
  AppKnowledgeRecallItem,
  "knowledgeId" | "knowledgeName"
>;

type KnowledgeRecallExecutionOptions = {
  queryVector?: number[];
};

const DEFAULT_TEXT_SEARCH_TERMS_LIMIT = 24;
const DEFAULT_MIN_SCORE = 0.2;
const DEFAULT_VECTOR_WEIGHT = 0.3;
const RELAXED_MIN_SCORE = 0.12;

const segmenter = useDefault(new Segment());

const clampScore = (score: number) =>
  Math.max(0, Math.min(1, Number(score.toFixed(4))));

const normalizeRecallText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const uniqueStrings = (items: string[]) => [...new Set(items)];

const normalizeRecallTerm = (value: string) =>
  value
    .replace(/^[^\p{L}\p{N}_./+-]+|[^\p{L}\p{N}_./+-]+$/gu, "")
    .trim()
    .toLowerCase();

const extractRecallTerms = (query: string) => {
  const normalizedQuery = normalizeRecallText(query);
  const terms: string[] = [];

  terms.push(
    ...Array.from(
      normalizedQuery.matchAll(/[A-Za-z][A-Za-z0-9_./+-]{1,}/g),
      (match) => match[0].toLowerCase(),
    ),
  );

  terms.push(
    ...segmenter
      .doSegment(normalizedQuery)
      .map((item) => normalizeRecallTerm(item.w))
      .filter((item) => /[\u3400-\u9fff]/.test(item)),
  );

  for (const term of [...terms]) {
    if (!/[\u3400-\u9fff]/.test(term)) continue;

    for (let index = 0; index <= term.length - 2; index += 1) {
      terms.push(term.slice(index, index + 2));
    }
  }

  return uniqueStrings(terms.map(normalizeRecallTerm)).slice(
    0,
    DEFAULT_TEXT_SEARCH_TERMS_LIMIT,
  );
};

const termWeight = (term: string) => {
  if (/^[a-z][a-z0-9_./+-]+$/i.test(term)) return term.length >= 4 ? 1.2 : 1;
  return term.length >= 3 ? 1.15 : 1;
};

const createTermWeightMap = (terms: string[]) => {
  const weights = new Map<string, number>();
  for (const term of terms) {
    weights.set(term, Math.max(weights.get(term) ?? 0, termWeight(term)));
  }

  return weights;
};

const createPhraseBonusWeightMap = (terms: string[]) => {
  const weights = new Map<string, number>();
  for (let index = 0; index < terms.length - 1; index += 1) {
    const left = terms[index];
    const right = terms[index + 1];
    if (!left || !right) continue;
    if (left.includes(right) || right.includes(left)) continue;

    const phrase = /[\u3400-\u9fff]/.test(left + right)
      ? `${left}${right}`
      : `${left} ${right}`;
    if (phrase.length < 4) continue;

    weights.set(
      phrase,
      Math.max(
        weights.get(phrase) ?? 0,
        Math.max(termWeight(left), termWeight(right)) * 0.6,
      ),
    );
  }

  return weights;
};

const calculateTermSimilarity = (queryTerms: string[], text: string) => {
  if (!queryTerms.length) return 0;

  const normalizedText = normalizeRecallText(text);
  const textTerms = new Set(extractRecallTerms(normalizedText));
  const queryWeights = createTermWeightMap(queryTerms);
  const phraseBonusWeights = createPhraseBonusWeightMap(queryTerms);
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const [term, weight] of queryWeights) {
    totalWeight += weight;
    if (textTerms.has(term) || normalizedText.includes(term)) {
      matchedWeight += weight;
    }
  }

  for (const [term, weight] of phraseBonusWeights) {
    if (textTerms.has(term) || normalizedText.includes(term)) {
      matchedWeight += weight;
    }
  }

  return totalWeight > 0 ? clampScore(matchedWeight / totalWeight) : 0;
};

const toTsQueryTerm = (value: string) =>
  value.replace(/[^\p{L}\p{N}_]+/gu, " ").trim();

const createTsQuery = (terms: string[]) =>
  terms
    .flatMap((term) => toTsQueryTerm(term).split(/\s+/))
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `${term}:*`)
    .join(" | ");

@Injectable()
export class KnowledgeRecallService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeRecallService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeDocumentChunk)
    private readonly chunkRepository: Repository<KnowledgeDocumentChunk>,
    private readonly documentEmbeddingService: DocumentEmbeddingService,
    private readonly documentRerankService: DocumentRerankService,
    private readonly documentVectorStoreService: DocumentVectorStoreService,
  ) {}

  onModuleInit() {
    void this.ensurePostgresTextSearch().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`知识库全文索引初始化失败: ${message}`);
    });
  }

  async recallTest(knowledgeId: number, dto: RecallTestDto) {
    const query = dto.query.trim();
    if (!query) throw new BadRequestException("检索文本不能为空");

    const { strategy, limit, minScore, vectorWeight, items } =
      await this.executeRecall(knowledgeId, query, dto);
    await this.incrementRecallCounts(knowledgeId, items);

    return {
      query,
      strategy,
      limit,
      minScore,
      vectorWeight,
      items,
    };
  }

  async recallForApp(params: {
    knowledgeIds: number[];
    settings?: AppKnowledgeRecallSettings;
    query: string;
    userId: number;
  }): Promise<AppKnowledgeRecallItem[]> {
    return (await this.recallForAppWithUsage(params)).items;
  }

  async recallForAppWithUsage(params: {
    knowledgeIds: number[];
    settings?: AppKnowledgeRecallSettings;
    query: string;
    userId: number;
  }): Promise<{ items: AppKnowledgeRecallItem[]; tokens: number }> {
    const query = params.query.trim();
    if (!query || !params.knowledgeIds.length) {
      return { items: [], tokens: 0 };
    }

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
    const queryEmbedding = needsQueryVector
      ? await this.createQueryEmbedding(query)
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
            { queryVector: queryEmbedding?.vector },
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

    return {
      items: results
        .sort((left, right) => right.score - left.score)
        .slice(0, limit),
      tokens: 0,
    };
  }

  private async createQueryEmbedding(query: string) {
    const embeddingResult = await this.documentEmbeddingService.embed([query]);
    return {
      vector: embeddingResult.vectors[0] ?? [],
    };
  }

  private async searchVectorRecall(
    knowledgeId: number,
    limit: number,
    queryVector?: number[],
  ): Promise<RecallMatch[]> {
    const vector = queryVector ?? [];
    if (!vector.length) return [];

    const points = await this.documentVectorStoreService.search({
      vector,
      knowledgeId,
      limit,
    });

    return points.map((point) => ({
      chunkId: point.payload.chunkId,
      score: clampScore(point.score),
      source: "vector",
      vectorScore: clampScore(point.score),
    }));
  }

  private async searchTextRecall(
    knowledgeId: number,
    query: string,
    limit: number,
  ): Promise<RecallMatch[]> {
    const terms = extractRecallTerms(query);
    const tsQuery = createTsQuery(terms);
    if (!terms.length || !tsQuery) return [];

    const rows = await this.dataSource.query<TextRecallRow[]>(
      `
        WITH search_input AS (
          SELECT
            to_tsquery('simple', $2) AS ts_query,
            $3::text[] AS trigram_terms
        )
        SELECT
          chunk.id AS "chunkId",
          GREATEST(
            ts_rank_cd(
              to_tsvector('simple', COALESCE(chunk."searchText", '') || ' ' || COALESCE(chunk."text", '')),
              search_input.ts_query
            ),
            COALESCE((
              SELECT MAX(similarity(LOWER(chunk."searchText"), term))
              FROM unnest(search_input.trigram_terms) AS terms(term)
            ), 0)
          ) AS "score"
        FROM "ai_knowledge_document_chunks" chunk
        INNER JOIN "ai_knowledge_documents" document
          ON document.id = chunk."documentId"
        CROSS JOIN search_input
        WHERE chunk."knowledgeId" = $1
          AND chunk.enabled = true
          AND document.enabled = true
          AND (
            to_tsvector('simple', COALESCE(chunk."searchText", '') || ' ' || COALESCE(chunk."text", '')) @@ search_input.ts_query
            OR EXISTS (
              SELECT 1
              FROM unnest(search_input.trigram_terms) AS terms(term)
              WHERE LOWER(chunk."searchText") % term
            )
          )
        ORDER BY "score" DESC, chunk.id DESC
        LIMIT $4
      `,
      [knowledgeId, tsQuery, terms.map((term) => term.toLowerCase()), limit],
    );

    const maxScore = Math.max(...rows.map((row) => Number(row.score) || 0), 0);

    return rows.map((row) => {
      const rawScore = Number(row.score) || 0;
      const score = maxScore > 0 ? clampScore(rawScore / maxScore) : 0;

      return {
        chunkId: Number(row.chunkId),
        score,
        source: "text",
        textScore: score,
      };
    });
  }

  private mergeRecallResultSets(resultSets: RecallMatch[][]): RecallMatch[] {
    const matchMap = new Map<number, RecallAccumulator>();

    for (const resultSet of resultSets) {
      for (const match of resultSet) {
        const existing = matchMap.get(match.chunkId);
        const vectorScore =
          match.vectorScore ?? (match.source === "vector" ? match.score : 0);
        const textScore =
          match.textScore ?? (match.source === "text" ? match.score : 0);

        if (!existing) {
          matchMap.set(match.chunkId, {
            chunkId: match.chunkId,
            source: match.source,
            vectorScore,
            textScore,
          });
          continue;
        }

        matchMap.set(match.chunkId, {
          chunkId: match.chunkId,
          source: existing.source === match.source ? match.source : "hybrid",
          vectorScore: Math.max(existing.vectorScore, vectorScore),
          textScore: Math.max(existing.textScore, textScore),
        });
      }
    }

    return [...matchMap.values()].map((match) => ({
      chunkId: match.chunkId,
      score: Math.max(match.vectorScore, match.textScore),
      source: match.source,
      vectorScore: match.vectorScore,
      textScore: match.textScore,
    }));
  }

  private async loadCandidates(
    matches: RecallMatch[],
    knowledgeId: number,
  ): Promise<RecallCandidate[]> {
    const chunks = matches.length
      ? await this.chunkRepository.find({
          where: {
            id: In(matches.map((item) => item.chunkId)),
            knowledgeId,
          },
          relations: { document: true },
        })
      : [];
    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    return matches.flatMap((match) => {
      const chunk = chunkMap.get(match.chunkId);
      if (!chunk?.enabled || !chunk.document?.enabled) return [];

      return [{ ...match, chunk }];
    });
  }

  private buildCandidateWeightedTexts(
    candidate: RecallCandidate,
  ): WeightedRecallText[] {
    const metadata = candidate.chunk.metadata as DocumentChunkMetadata;

    return [
      { text: candidate.chunk.document.name, boost: 1.15 },
      { text: metadata.documentTitle, boost: 1.35 },
      { text: metadata.sectionTitle, boost: 1.45 },
      { text: metadata.headingPath, boost: 1.4 },
      { text: metadata.sectionHeadingPath, boost: 1.45 },
      { text: metadata.keywords, boost: 1.3 },
      { text: candidate.chunk.searchText, boost: 1 },
      { text: candidate.chunk.text, boost: 0.95 },
    ];
  }

  private calculateCandidateTextScore(
    queryTerms: string[],
    candidate: RecallCandidate,
  ) {
    let score = 0;

    for (const item of this.buildCandidateWeightedTexts(candidate)) {
      const text = Array.isArray(item.text)
        ? item.text.filter(Boolean).join(" ")
        : item.text;
      if (!text) continue;

      score = Math.max(
        score,
        clampScore(calculateTermSimilarity(queryTerms, text) * item.boost),
      );
    }

    return score;
  }

  private scoreCandidates(
    queryTerms: string[],
    candidates: RecallCandidate[],
    strategy: KnowledgeRecallStrategy,
    vectorWeight: number,
  ): RecallCandidate[] {
    const textWeight = 1 - vectorWeight;

    return candidates
      .map((candidate) => {
        const vectorScore = clampScore(candidate.vectorScore ?? 0);
        const textScore = Math.max(
          clampScore(candidate.textScore ?? 0),
          this.calculateCandidateTextScore(queryTerms, candidate),
        );
        const score =
          strategy === "vector"
            ? vectorScore
            : strategy === "text"
              ? textScore
              : clampScore(textWeight * textScore + vectorWeight * vectorScore);
        const source: KnowledgeRecallStrategy =
          vectorScore > 0 && textScore > 0
            ? "hybrid"
            : vectorScore > 0
              ? "vector"
              : "text";

        return {
          ...candidate,
          score,
          source: strategy === "hybrid" ? source : strategy,
          vectorScore,
          textScore,
        };
      })
      .sort((left, right) => this.compareCandidates(left, right));
  }

  private dedupeCandidatesBySection(
    candidates: RecallCandidate[],
  ): RecallCandidate[] {
    const sectionMap = new Map<string, RecallCandidate>();

    for (const candidate of candidates) {
      const metadata = candidate.chunk.metadata as DocumentChunkMetadata;
      const sectionKey = [
        candidate.chunk.documentId,
        metadata.sectionId ?? `chunk-${candidate.chunk.id}`,
      ].join(":");
      const existing = sectionMap.get(sectionKey);

      if (!existing || this.compareCandidates(candidate, existing) < 0) {
        sectionMap.set(sectionKey, candidate);
      }
    }

    return [...sectionMap.values()].sort((left, right) =>
      this.compareCandidates(left, right),
    );
  }

  private compareCandidates(left: RecallCandidate, right: RecallCandidate) {
    const scoreDiff =
      this.getCandidateRankScore(right) - this.getCandidateRankScore(left);
    if (scoreDiff !== 0) return scoreDiff;

    return left.chunk.chunkIndex - right.chunk.chunkIndex;
  }

  private getCandidateRankScore(candidate: RecallCandidate) {
    if (candidate.rerankScore === undefined) return candidate.score;

    return clampScore(candidate.rerankScore * 0.75 + candidate.score * 0.25);
  }

  private async rerankCandidates(
    query: string,
    candidates: RecallCandidate[],
    limit: number,
  ) {
    const rerankResults = await this.documentRerankService.rerank({
      query,
      topN: Math.min(candidates.length, Math.max(limit * 4, limit)),
      documents: candidates.map((candidate) => ({
        id: candidate.chunk.id,
        text: candidate.chunk.searchText || candidate.chunk.text,
      })),
    });
    if (!rerankResults.length) return candidates;

    const scoreMap = new Map(
      rerankResults.map((item) => [item.id, item.score]),
    );

    return candidates
      .map((candidate) => ({
        ...candidate,
        rerankScore: scoreMap.get(candidate.chunk.id),
      }))
      .sort((left, right) => this.compareCandidates(left, right));
  }

  private normalizeRecallSettings(settings: AppKnowledgeRecallSettings = {}) {
    const strategy = settings.strategy ?? "hybrid";
    const limit = Math.min(20, Math.max(1, Math.floor(settings.limit ?? 5)));
    const minScore = Math.min(
      1,
      Math.max(0, settings.minScore ?? DEFAULT_MIN_SCORE),
    );
    const vectorWeight = Math.min(
      1,
      Math.max(0, settings.vectorWeight ?? DEFAULT_VECTOR_WEIGHT),
    );

    return { strategy, limit, minScore, vectorWeight };
  }

  private selectCandidatesForRerank(
    candidates: RecallCandidate[],
    minScore: number,
  ) {
    const filteredCandidates = candidates.filter(
      (item) => item.score >= minScore,
    );
    if (filteredCandidates.length) return filteredCandidates;

    const relaxedMinScore = Math.min(minScore, RELAXED_MIN_SCORE);
    return candidates.filter((item) => item.score >= relaxedMinScore);
  }

  private async ensurePostgresTextSearch() {
    await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_knowledge_document_chunks_search_text_fts"
      ON "ai_knowledge_document_chunks"
      USING GIN (to_tsvector('simple', COALESCE("searchText", '') || ' ' || COALESCE("text", '')))
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_knowledge_document_chunks_search_text_trgm"
      ON "ai_knowledge_document_chunks"
      USING GIN (LOWER("searchText") gin_trgm_ops)
    `);
  }

  private async executeRecall(
    knowledgeId: number,
    query: string,
    settings: AppKnowledgeRecallSettings = {},
    options: KnowledgeRecallExecutionOptions = {},
  ) {
    const { strategy, limit, minScore, vectorWeight } =
      this.normalizeRecallSettings(settings);
    const recallLimit =
      strategy === "vector" ? limit : Math.min(1024, Math.max(limit * 16, 64));
    const recallTasks: Array<Promise<RecallMatch[]>> = [];
    let queryVector: number[] | undefined;

    if (strategy === "hybrid" || strategy === "vector") {
      queryVector =
        options.queryVector ?? (await this.createQueryEmbedding(query)).vector;
    }

    if (strategy === "hybrid" || strategy === "vector") {
      recallTasks.push(
        this.searchVectorRecall(knowledgeId, recallLimit, queryVector),
      );
    }

    if (strategy === "hybrid" || strategy === "text") {
      recallTasks.push(this.searchTextRecall(knowledgeId, query, recallLimit));
    }

    const resultSets = await Promise.all(recallTasks);
    const mergedMatches = this.mergeRecallResultSets(resultSets);
    const queryTerms = extractRecallTerms(query);
    const candidates = this.scoreCandidates(
      queryTerms,
      await this.loadCandidates(mergedMatches, knowledgeId),
      strategy,
      vectorWeight,
    ).slice(0, recallLimit);
    const rerankedCandidates = await this.rerankCandidates(
      query,
      this.selectCandidatesForRerank(candidates, minScore),
      limit,
    );
    const items = this.dedupeCandidatesBySection(rerankedCandidates)
      .slice(0, limit)
      .map((item) => ({
        chunkId: item.chunk.id,
        documentId: item.chunk.documentId,
        documentName: item.chunk.document.name,
        chunkIndex: item.chunk.chunkIndex,
        score: clampScore(item.score),
        rerankScore:
          item.rerankScore === undefined
            ? undefined
            : clampScore(item.rerankScore),
        vectorScore: clampScore(item.vectorScore ?? 0),
        textScore: clampScore(item.textScore ?? 0),
        source: item.source,
        text: item.chunk.text,
        searchText: item.chunk.searchText,
        metadata: item.chunk.metadata as unknown as Record<string, unknown>,
      }));

    return {
      strategy,
      limit,
      minScore,
      vectorWeight,
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
