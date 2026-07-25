import request from '../request'
import { getAccessToken } from '@/utils/auth'

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface PageParams {
  page?: number
  pageSize?: number
  name?: string
  scope?: 'mine' | 'available'
  categoryKey?: string
}

export interface LlmItem {
  id: number
  provider: string
  modelName: string
  url: string
  createdAt?: string
  updatedAt?: string
}

export interface CategoryItem {
  id: number
  key: string
  name: string
  sort: number
  createdAt?: string
  updatedAt?: string
}

export type AiAppCategoryItem = CategoryItem
export type PluginCategoryItem = CategoryItem

export interface AiAppItem {
  id: number
  name: string
  image?: string | null
  description?: string | null
  category?: AiAppCategoryItem | null
  model?: Pick<LlmItem, 'id' | 'provider' | 'modelName'> | null
  status: boolean
  createdAt?: string
  updatedAt?: string
}

export type AiAppVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type KnowledgeRecallStrategy = 'hybrid' | 'vector' | 'text'

export interface AppKnowledgeRecallSettings {
  strategy?: KnowledgeRecallStrategy
  limit?: number
  minScore?: number
}

export interface AppKnowledgeCitation {
  id: number
  query?: string
  queries?: string[]
  knowledgeId: number
  knowledgeName: string
  documentId: number
  documentName: string
  chunkIndex: number
  score: number
  text: string
}

export interface AiAppVersionConfig {
  prompt?: string
  llmId?: number | null
  modelSettings?: {
    temperature?: number
    topP?: number
    presencePenalty?: number
    frequencyPenalty?: number
    contextRounds?: number
  }
  capabilities?: Array<{
    key: string
    title: string
    description?: string
    icon?: string
    tone?: string
  }>
  pluginIds?: number[]
  workflowIds?: number[]
  knowledge?: {
    ids?: number[]
    settings?: AppKnowledgeRecallSettings
  }
  toggles?: Record<string, boolean>
  openingStatement?: {
    content?: string
    questions?: string[]
  }
}

export interface AppVersionPluginItem {
  id: number
  icon?: string | null
  name: string
  description?: string | null
  category?: PluginCategoryItem | null
  published?: boolean
}

export interface AppVersionKnowledgeItem {
  id: number
  icon?: string | null
  name: string
  description?: string | null
  status: boolean
}

export interface AiAppVersionItem {
  id: number
  appId: number
  version: string
  status: AiAppVersionStatus
  config: AiAppVersionConfig
  plugins?: AppVersionPluginItem[]
  knowledges?: AppVersionKnowledgeItem[]
  publishedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PluginHeader {
  key: string
  value: string
}

export interface PluginItem {
  id: number
  icon?: string | null
  name: string
  description?: string | null
  category?: PluginCategoryItem | null
  openapiSchema: string
  headers?: PluginHeader[] | null
  status: boolean
  published: boolean
  createdAt?: string
  updatedAt?: string
}

export interface WorkflowItem {
  id: number
  icon?: string | null
  name: string
  englishName: string
  description?: string | null
  status: boolean
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgeItem {
  id: number
  icon?: string | null
  name: string
  description?: string | null
  status: boolean
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgeDocumentItem {
  id: number
  knowledgeId: number
  fileId?: number | null
  name: string
  contentType: string
  size: number
  url: string
  characterCount: number
  recallCount: number
  enabled: boolean
  parseStatus: 'uploaded' | 'parsing' | 'parsed' | 'failed'
  parseError?: string | null
  parsedText?: string | null
  parsedDocument?: ParsedDocument | null
  parsedAt?: string | null
  cleanStatus: 'pending' | 'cleaning' | 'cleaned' | 'failed'
  cleanError?: string | null
  cleanedText?: string | null
  cleanedDocument?: CleanedDocument | null
  cleanedAt?: string | null
  enhanceStatus: 'pending' | 'enhancing' | 'enhanced' | 'failed'
  enhanceError?: string | null
  enhancedText?: string | null
  enhancedDocument?: EnhancedDocument | null
  enhancedAt?: string | null
  chunkStatus: 'pending' | 'chunking' | 'chunked' | 'failed'
  chunkError?: string | null
  chunkCount: number
  chunkedAt?: string | null
  embeddingStatus: 'pending' | 'queued' | 'embedding' | 'embedded' | 'failed'
  embeddingError?: string | null
  embeddingModel?: string | null
  embeddingDimension: number
  embeddedAt?: string | null
  indexStatus: 'pending' | 'indexing' | 'indexed' | 'failed'
  indexError?: string | null
  vectorCollection?: string | null
  indexedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgeDocumentChunkItem {
  id: number
  knowledgeId: number
  documentId: number
  chunkIndex: number
  text: string
  searchText: string
  tokenCount: number
  characterCount: number
  recallCount: number
  enabled: boolean
  embeddingModel: string
  embeddingDimension: number
  vectorId: string
  metadata: {
    keywords?: string[]
    headingPath?: string[]
    blockTypes?: string[]
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
}

export interface ParsedDocumentBlock {
  id: string
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'code' | 'json'
  text: string
  level?: number
  page?: number
  language?: string
  headingPath?: string[]
  rows?: string[][]
  metadata?: Record<string, string | number | boolean | null | string[] | number[]>
}

export interface ParsedDocument {
  title: string
  format: string
  contentType: string
  text: string
  characterCount: number
  blocks: ParsedDocumentBlock[]
  metadata: {
    parser: string
    blockCount: number
    warnings?: string[]
    cleaner?: string
    removedBlockCount?: number
    originalCharacterCount?: number
    rules?: string[]
    enhancer?: string
    sourceCharacterCount?: number
    summary?: string
    keywords?: string[]
    enhancementRules?: string[]
  }
}

export type CleanedDocument = ParsedDocument
export type EnhancedDocument = ParsedDocument

export type CreateLlmPayload = Omit<LlmItem, 'id' | 'createdAt' | 'updatedAt'> & {
  apiKey: string
}
export type UpdateLlmPayload = Partial<CreateLlmPayload>

export interface CreateAiAppPayload {
  name: string
  image?: string
  imageFileId?: number
  categoryId: number
  description?: string
  status?: boolean
}

export type UpdateAiAppPayload = Partial<CreateAiAppPayload>

export interface CreatePluginPayload {
  icon?: string
  iconFileId?: number
  name: string
  description?: string
  categoryId?: number
  openapiSchema: string
  headers?: PluginHeader[]
  status?: boolean
  published?: boolean
}

export type UpdatePluginPayload = Partial<CreatePluginPayload>

export interface CreateWorkflowPayload {
  icon?: string
  iconFileId?: number
  name: string
  englishName: string
  description?: string
  status?: boolean
}

export type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>

export interface CreateKnowledgePayload {
  icon?: string
  iconFileId?: number
  name: string
  description?: string
  status?: boolean
}

export type UpdateKnowledgePayload = Partial<CreateKnowledgePayload>

export interface KnowledgeDocumentChunkConfig {
  separator?: string
  maxSegmentLength?: number
  replaceWhitespace?: boolean
  removeUrls?: boolean
}

export interface CreateKnowledgeDocumentPayload {
  fileId: number
  chunkConfig?: KnowledgeDocumentChunkConfig
}

export interface CreateKnowledgeDocumentChunkPayload {
  text: string
  keywords?: string[]
}

export interface UpdateKnowledgeDocumentChunkPayload {
  text?: string
  keywords?: string[]
  enabled?: boolean
}

export interface RecallTestPayload {
  query: string
  strategy?: KnowledgeRecallStrategy
  limit?: number
  minScore?: number
}

export interface RecallTestResultItem {
  chunkId: number
  documentId: number
  documentName: string
  chunkIndex: number
  score: number
  source: KnowledgeRecallStrategy
  text: string
  searchText: string
  metadata: Record<string, unknown>
}

export interface RecallTestResult {
  query: string
  strategy: KnowledgeRecallStrategy
  limit: number
  minScore: number
  items: RecallTestResultItem[]
}

export interface UpdateKnowledgeDocumentPayload {
  name?: string
  enabled?: boolean
}

export const listLlmsApi = async (params?: PageParams): Promise<PageResult<LlmItem>> => {
  return request.get('/ai/llms', { params })
}

export const createLlmApi = async (payload: CreateLlmPayload) => {
  return request.post('/ai/llms', payload)
}

export const updateLlmApi = async (id: number, payload: UpdateLlmPayload) => {
  return request.put(`/ai/llms/${id}`, payload)
}

export const deleteLlmApi = async (id: number) => {
  return request.delete(`/ai/llms/${id}`)
}

export const listAiAppsApi = async (params?: PageParams): Promise<PageResult<AiAppItem>> => {
  return request.get('/ai/apps', { params })
}

export const getAiAppApi = async (id: number): Promise<AiAppItem> => {
  return request.get(`/ai/apps/${id}`)
}

export const listAiAppCategoriesApi = async (): Promise<AiAppCategoryItem[]> => {
  return request.get('/ai/apps/categories')
}

export const createAiAppApi = async (payload: CreateAiAppPayload) => {
  return request.post('/ai/apps', payload)
}

export const updateAiAppApi = async (id: number, payload: UpdateAiAppPayload) => {
  return request.put(`/ai/apps/${id}`, payload)
}

export const deleteAiAppApi = async (id: number) => {
  return request.delete(`/ai/apps/${id}`)
}

export const getAiAppDraftApi = async (id: number): Promise<AiAppVersionItem> => {
  return request.get(`/ai/apps/${id}/draft`)
}

export const updateAiAppDraftApi = async (
  id: number,
  payload: { config: AiAppVersionConfig },
): Promise<AiAppVersionItem> => {
  return request.put(`/ai/apps/${id}/draft`, payload)
}

export const listAiAppVersionsApi = async (id: number): Promise<AiAppVersionItem[]> => {
  return request.get(`/ai/apps/${id}/versions`)
}

export const publishAiAppVersionApi = async (id: number): Promise<AiAppVersionItem> => {
  return request.post(`/ai/apps/${id}/versions/publish`)
}

export const restoreAiAppVersionApi = async (
  appId: number,
  versionId: number,
): Promise<AiAppVersionItem> => {
  return request.post(`/ai/apps/${appId}/versions/${versionId}/restore`)
}

export const optimizeAiAppPromptApi = async (
  appId: number,
  payload: { prompt: string },
): Promise<{ prompt: string }> => {
  return request.post(`/ai/apps/${appId}/prompt/optimize`, payload, { timeout: 60000 })
}

type StreamAiAppPromptOptimizeParams = {
  appId: number
  prompt: string
  onContent: (content: string) => void
  signal?: AbortSignal
}

export const streamAiAppPromptOptimizeApi = async ({
  appId,
  prompt,
  onContent,
  signal,
}: StreamAiAppPromptOptimizeParams) => {
  const baseURL = import.meta.env.VITE_API_BASE_URL || ''
  const token = getAccessToken()
  const response = await fetch(`${baseURL}/ai/apps/${appId}/prompt/optimize/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt }),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error('优化接口请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const consumeEvent = (rawEvent: string) => {
    const lines = rawEvent.split('\n')
    const eventName =
      lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim() || 'message'
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')

    if (!data || data === '[DONE]') return

    const payload = JSON.parse(data) as {
      content?: string
      message?: string
    }
    if (eventName === 'error') {
      throw new Error(payload.message || '优化接口请求失败')
    }
    if (payload.content) {
      onContent(payload.content)
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    events.forEach(consumeEvent)
  }

  if (buffer) {
    consumeEvent(buffer)
  }
}

type StreamAiAppDebugParams = {
  appId: number
  message: string
  history?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  onContent: (content: string) => void
  onMeta?: (meta: { elapsedMs: number; tokens?: number }) => void
  onKnowledge?: (payload: { query: string; items: AppKnowledgeCitation[] }) => void
  onSuggestions?: (items: string[]) => void
  onError?: (message: string) => void
  signal?: AbortSignal
}

export const streamAiAppDebugApi = async ({
  appId,
  message,
  history,
  onContent,
  onMeta,
  onKnowledge,
  onSuggestions,
  onError,
  signal,
}: StreamAiAppDebugParams) => {
  const baseURL = import.meta.env.VITE_API_BASE_URL || ''
  const token = getAccessToken()
  const response = await fetch(`${baseURL}/ai/apps/${appId}/debug/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error('调试接口请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const consumeEvent = (rawEvent: string) => {
    const lines = rawEvent.split('\n')
    const eventName =
      lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim() || 'message'
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')

    if (!data || data === '[DONE]') return

    const payload = JSON.parse(data) as {
      content?: string
      elapsedMs?: number
      tokens?: number
      query?: string
      items?: string[] | AppKnowledgeCitation[]
    }
    if (eventName === 'error') {
      onError?.((payload as { message?: string }).message || '调试接口请求失败')
      return
    }
    if (eventName === 'suggestions') {
      onSuggestions?.(
        Array.isArray(payload.items)
          ? payload.items.filter((item): item is string => typeof item === 'string')
          : [],
      )
      return
    }
    if (eventName === 'knowledge') {
      onKnowledge?.({
        query: typeof payload.query === 'string' ? payload.query : '',
        items: Array.isArray(payload.items) ? (payload.items as AppKnowledgeCitation[]) : [],
      })
      return
    }
    if (eventName === 'meta' && payload.elapsedMs !== undefined) {
      onMeta?.({ elapsedMs: payload.elapsedMs, tokens: payload.tokens })
      return
    }
    if (payload.content) {
      onContent(payload.content)
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    events.forEach(consumeEvent)
  }

  if (buffer) {
    consumeEvent(buffer)
  }
}

export const listPluginsApi = async (params?: PageParams): Promise<PageResult<PluginItem>> => {
  return request.get('/ai/plugins', { params })
}

export const listPluginCategoriesApi = async (): Promise<PluginCategoryItem[]> => {
  return request.get('/ai/plugins/categories')
}

export const getPluginApi = async (id: number): Promise<PluginItem> => {
  return request.get(`/ai/plugins/${id}`)
}

export const createPluginApi = async (payload: CreatePluginPayload) => {
  return request.post('/ai/plugins', payload)
}

export const updatePluginApi = async (id: number, payload: UpdatePluginPayload) => {
  return request.put(`/ai/plugins/${id}`, payload)
}

export const deletePluginApi = async (id: number) => {
  return request.delete(`/ai/plugins/${id}`)
}

export const listWorkflowsApi = async (params?: PageParams): Promise<PageResult<WorkflowItem>> => {
  return request.get('/ai/workflows', { params })
}

export const createWorkflowApi = async (payload: CreateWorkflowPayload) => {
  return request.post('/ai/workflows', payload)
}

export const updateWorkflowApi = async (id: number, payload: UpdateWorkflowPayload) => {
  return request.put(`/ai/workflows/${id}`, payload)
}

export const deleteWorkflowApi = async (id: number) => {
  return request.delete(`/ai/workflows/${id}`)
}

export const listKnowledgeApi = async (params?: PageParams): Promise<PageResult<KnowledgeItem>> => {
  return request.get('/ai/knowledge', { params })
}

export const getKnowledgeApi = async (id: number): Promise<KnowledgeItem> => {
  return request.get(`/ai/knowledge/${id}`)
}

export const createKnowledgeApi = async (payload: CreateKnowledgePayload) => {
  return request.post('/ai/knowledge', payload)
}

export const updateKnowledgeApi = async (id: number, payload: UpdateKnowledgePayload) => {
  return request.put(`/ai/knowledge/${id}`, payload)
}

export const deleteKnowledgeApi = async (id: number) => {
  return request.delete(`/ai/knowledge/${id}`)
}

export const listKnowledgeDocumentsApi = async (
  knowledgeId: number,
  params?: PageParams,
): Promise<PageResult<KnowledgeDocumentItem>> => {
  return request.get(`/ai/knowledge/${knowledgeId}/documents`, { params })
}

export const getKnowledgeDocumentApi = async (
  knowledgeId: number,
  documentId: number,
  options: { suppressErrorNotify?: boolean } = {},
): Promise<KnowledgeDocumentItem> => {
  return request.get(`/ai/knowledge/${knowledgeId}/documents/${documentId}`, {
    suppressErrorNotify: options.suppressErrorNotify,
  })
}

export const listKnowledgeDocumentChunksApi = async (
  knowledgeId: number,
  documentId: number,
  params?: PageParams & { keyword?: string },
): Promise<PageResult<KnowledgeDocumentChunkItem>> => {
  return request.get(`/ai/knowledge/${knowledgeId}/documents/${documentId}/chunks`, { params })
}

export const createKnowledgeDocumentChunkApi = async (
  knowledgeId: number,
  documentId: number,
  payload: CreateKnowledgeDocumentChunkPayload,
): Promise<KnowledgeDocumentChunkItem> => {
  return request.post(`/ai/knowledge/${knowledgeId}/documents/${documentId}/chunks`, payload, {
    timeout: 60000,
  })
}

export const updateKnowledgeDocumentChunkApi = async (
  knowledgeId: number,
  documentId: number,
  chunkId: number,
  payload: UpdateKnowledgeDocumentChunkPayload,
): Promise<KnowledgeDocumentChunkItem> => {
  return request.put(
    `/ai/knowledge/${knowledgeId}/documents/${documentId}/chunks/${chunkId}`,
    payload,
    {
      timeout: 60000,
    },
  )
}

export const deleteKnowledgeDocumentChunkApi = async (
  knowledgeId: number,
  documentId: number,
  chunkId: number,
) => {
  return request.delete(`/ai/knowledge/${knowledgeId}/documents/${documentId}/chunks/${chunkId}`)
}

export const createKnowledgeDocumentApi = async (
  knowledgeId: number,
  payload: CreateKnowledgeDocumentPayload,
  options: { suppressErrorNotify?: boolean } = {},
): Promise<KnowledgeDocumentItem> => {
  return request.post(`/ai/knowledge/${knowledgeId}/documents`, payload, {
    suppressErrorNotify: options.suppressErrorNotify,
  })
}

export const recallTestApi = async (
  knowledgeId: number,
  payload: RecallTestPayload,
): Promise<RecallTestResult> => {
  return request.post(`/ai/knowledge/${knowledgeId}/recall-test`, payload)
}

export const updateKnowledgeDocumentApi = async (
  knowledgeId: number,
  documentId: number,
  payload: UpdateKnowledgeDocumentPayload,
): Promise<KnowledgeDocumentItem> => {
  return request.put(`/ai/knowledge/${knowledgeId}/documents/${documentId}`, payload)
}

export const deleteKnowledgeDocumentApi = async (knowledgeId: number, documentId: number) => {
  return request.delete(`/ai/knowledge/${knowledgeId}/documents/${documentId}`)
}
