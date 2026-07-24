export interface VectorPointPayload {
  knowledgeId: number;
  documentId: number;
  documentName: string;
  chunkId: number;
  chunkIndex: number;
  text: string;
  searchText: string;
  metadata: unknown;
}

export interface UpsertVectorPoint {
  id: string;
  vector: number[];
  payload: VectorPointPayload;
}
