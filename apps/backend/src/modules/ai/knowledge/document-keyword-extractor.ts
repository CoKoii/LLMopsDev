import { Segment, useDefault } from "segmentit";

const MAX_KEYWORD_LENGTH = 24;
const DEFAULT_KEYWORD_LIMIT = 4;

const segmenter = useDefault(new Segment());

const STOP_WORDS = new Set([
  "这个",
  "那个",
  "一个",
  "一种",
  "以及",
  "进行",
  "通过",
  "使用",
  "可以",
  "需要",
  "相关",
  "内容",
  "文档",
  "文件",
  "用户",
  "系统",
  "时候",
  "其中",
  "如果",
  "然后",
  "但是",
  "因为",
  "所以",
  "对于",
  "关于",
  "根据",
  "包括",
  "或者",
  "并且",
  "及其",
]);

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeKeyword = (value: string) =>
  compact(value)
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const isValidKeyword = (value: string) =>
  value.length >= 2 &&
  value.length <= MAX_KEYWORD_LENGTH &&
  !STOP_WORDS.has(value) &&
  !/^\d+$/.test(value) &&
  !/\.(md|txt|docx?|xlsx?|pdf|csv|json|html?)$/i.test(value);

const createCandidateScore = (value: string) => {
  const cjkCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const lengthScore = Math.min(value.length, 8) / 8;
  const cjkScore = cjkCount >= 2 ? 0.4 : 0;
  return 1 + lengthScore + cjkScore;
};

const collectSegmentKeywords = (text: string) =>
  segmenter
    .doSegment(text)
    .map((item) => normalizeKeyword(item.w))
    .filter(isValidKeyword);

const collectAsciiKeywords = (text: string) =>
  Array.from(text.matchAll(/[A-Za-z][A-Za-z0-9_./+-]{1,}/g), (match) =>
    normalizeKeyword(match[0]),
  ).filter(isValidKeyword);

export const extractChunkKeywords = (
  text: string,
  seeds: string[] = [],
  limit = DEFAULT_KEYWORD_LIMIT,
) => {
  const normalizedText = compact(text);
  const scores = new Map<string, number>();
  const candidates = [
    ...collectSegmentKeywords(normalizedText),
    ...collectAsciiKeywords(normalizedText),
    ...seeds
      .map(normalizeKeyword)
      .filter((item) => normalizedText.includes(item)),
  ];

  for (const keyword of candidates) {
    scores.set(
      keyword,
      (scores.get(keyword) ?? 0) + createCandidateScore(keyword),
    );
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([keyword]) => keyword)
    .slice(0, limit);
};
