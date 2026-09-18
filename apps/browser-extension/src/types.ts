export interface ClipSettings {
  knowledgeId?: number
}

export interface AuthState {
  accessToken: string
  refreshToken: string
  username?: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface UserProfile {
  id: number
  username?: string
  nickname?: string
}

export interface WebClipPayload {
  id: string
  title: string
  url: string
  selector: string
  text: string
  html: string
  markdown: string
  capturedAt: string
  characterCount: number
}

export interface KnowledgeItem {
  id: number
  icon?: string | null
  name: string
  description?: string | null
  status: boolean
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface UploadedFile {
  id: number
  originalName: string
  contentType: string
  size: number
  url: string
  status: 'pending' | 'uploaded' | 'used'
}

export interface UploadIntent {
  file: UploadedFile
  upload: {
    method: 'PUT'
    url: string
    headers: Record<string, string>
    expiresAt: string
  }
}

export interface KnowledgeDocumentItem {
  id: number
  name: string
  parseStatus: 'uploaded' | 'parsing' | 'parsed' | 'failed'
  cleanStatus: 'pending' | 'cleaning' | 'cleaned' | 'failed'
  enhanceStatus: 'pending' | 'enhancing' | 'enhanced' | 'failed'
  chunkStatus: 'pending' | 'chunking' | 'chunked' | 'failed'
  embeddingStatus: 'pending' | 'queued' | 'embedding' | 'embedded' | 'failed'
  indexStatus: 'pending' | 'indexing' | 'indexed' | 'failed'
  parseError?: string | null
  cleanError?: string | null
  enhanceError?: string | null
  chunkError?: string | null
  embeddingError?: string | null
  indexError?: string | null
}

export interface CleanWebClipResult {
  markdown: string
  cleanedBy: 'ai' | 'rule'
  warning?: string
}
