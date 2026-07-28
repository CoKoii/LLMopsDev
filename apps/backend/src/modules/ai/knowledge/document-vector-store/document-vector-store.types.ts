export interface KnowledgeVectorPointPayload {
  source?: "knowledge";
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

export interface ChatAttachmentVectorPointPayload {
  source: "chat_attachment";
  sessionId: number;
  messageId: number;
  attachmentId: number;
  fileId: number;
  fileName: string;
  kind?: "document" | "image";
  displayOrder?: number;
  kindOrder?: number;
  displayLabel?: string;
  contentHash?: string;
  duplicateOfAttachmentId?: number | null;
  duplicateOfLabel?: string | null;
  chunkId: number;
  chunkIndex: number;
  text: string;
  searchText: string;
  enabled?: boolean;
  metadata: unknown;
}

export type VectorPointPayload =
  | KnowledgeVectorPointPayload
  | ChatAttachmentVectorPointPayload;

export interface UpsertVectorPoint {
  id: string;
  vector: number[];
  payload: VectorPointPayload;
}

export interface SearchVectorPoint<
  TPayload extends VectorPointPayload = VectorPointPayload,
> {
  score: number;
  payload: TPayload;
}
