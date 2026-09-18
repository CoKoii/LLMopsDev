const RERANK_ENDPOINT_PATTERN = /\/reranks?$/i;

export const resolveRerankEndpoint = (baseUrl: string) => {
  const url = baseUrl.trim().replace(/\/+$/, "");
  return RERANK_ENDPOINT_PATTERN.test(url) ? url : `${url}/reranks`;
};

export const DEFAULT_RERANK_INSTRUCT =
  "Given a web search query, retrieve relevant passages that answer the query.";
