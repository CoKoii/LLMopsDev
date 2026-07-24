export interface VectorPointPayload {
  knowledgeId: number;
  documentId: number;
  documentName: string;
  chunkId: number;
  chunkIndex: number;
  text: string;
  searchText: string;
  enabled?: boolean;
  metadata: unknown;
}

export interface UpsertVectorPoint {
  id: string;
  vector: number[];
  payload: VectorPointPayload;
}

export interface SearchVectorPoint {
  score: number;
  payload: VectorPointPayload;
}
