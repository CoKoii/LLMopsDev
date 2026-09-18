export const estimateTokens = (text: string) => {
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9_./:-]+/g)?.length ?? 0;
  const other = Math.max(0, text.length - cjkCount);
  return Math.max(1, Math.ceil(cjkCount + words * 1.25 + other * 0.08));
};

export const estimateTextListTokens = (items: string[]) =>
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((total, item) => total + estimateTokens(item), 0);
