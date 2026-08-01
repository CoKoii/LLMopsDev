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
  usageType?: LlmUsageType
  enabled?: boolean
  scope?: 'mine' | 'available'
  categoryKey?: string
}

export type LlmUsageType =
  | 'chat'
  | 'structured'
  | 'embedding'
  | 'multimodal'
  | 'rerank'
  | 'speech_to_text'
  | 'text_to_speech'
export type LlmTestStatus = 'untested' | 'success' | 'failed'

export interface LlmItem {
  id: number
  usageType: LlmUsageType
  modelName: string
  baseUrl: string
  enabled: boolean
  isDefault: boolean
  apiKeyConfigured: boolean
  lastTestStatus: LlmTestStatus
  lastTestMessage?: string | null
  lastTestedAt?: string | null
  remark?: string | null
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
  model?: Pick<LlmItem, 'id' | 'modelName'> | null
  status: boolean
  published?: boolean
  publishedVersionId?: number | null
  createdAt?: string
  updatedAt?: string
}

export type AiAppVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type KnowledgeRecallStrategy = 'hybrid' | 'vector' | 'text'

export interface AppKnowledgeRecallSettings {
  strategy?: KnowledgeRecallStrategy
  limit?: number
  minScore?: number
  vectorWeight?: number
}

export type AppPluginOperationSettings = Record<string, unknown>
export type AppPluginSettings = Record<string, Record<string, AppPluginOperationSettings>>

export interface AppKnowledgeCitation {
  id: number
  queries: string[]
  knowledgeId: number
  knowledgeName: string
  documentId: number
  documentName: string
  chunkIndex: number
  score: number
  text: string
}

export interface AppAttachmentCitation {
  id: number
  attachmentId: number
  messageId: number
  fileId: number
  fileName: string
  displayLabel?: string
  duplicateOfLabel?: string | null
  queries?: string[]
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
  pluginSettings?: AppPluginSettings
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
  standaloneActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AiAppPublishConfig {
  appId: number
  published: boolean
  hasVersion: boolean
  version: AiAppVersionItem | null
}

export interface StandaloneAiAppMeta {
  app: AiAppItem
  version: {
    id: number
    version: string
    publishedAt?: string | null
  }
  published: boolean
  owner: boolean
  openingStatement: {
    content?: string
    questions?: string[]
  }
  toggles: Record<string, boolean>
}

export interface StandaloneChatSessionItem {
  id: number
  appId: number
  title: string
  pinnedAt?: string | null
  lastMessageAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface StandaloneChatMessageItem {
  id: number
  sessionId: number
  role: 'user' | 'assistant'
  content: string
  status: 'completed' | 'streaming' | 'failed' | 'stopped'
  elapsedMs?: number | null
  tokens?: number | null
  attachments?: Array<{
    uid: string
    fileId: number
    name: string
    contentType: string
    size: number
    url?: string
  }>
  createdAt?: string
  updatedAt?: string
}

export interface AppChatMemory {
  id: number
  content: string
  generatedAt?: string | null
  updatedAt?: string
}

export interface AiAppStatsDailyItem {
  date: string
  sessions: number
  activeUsers: number
  tokens: number
  tokensPerSecond?: number
}

export interface AiAppStatsRecentMessage {
  id: number
  mode: 'debug' | 'standalone'
  title: string
  tokens: number
  tokensPerSecond?: number
  createdAt?: string
}

export interface AiAppStats {
  range: {
    days: 7 | 30
    start: string
    end: string
  }
  overview: {
    sessions: number
    activeUsers: number
    tokens: number
    tokensPerSecond?: number
  }
  daily: AiAppStatsDailyItem[]
  recentMessages: AiAppStatsRecentMessage[]
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

export interface CreateLlmPayload {
  usageType: LlmUsageType
  modelName: string
  baseUrl: string
  apiKey: string
  enabled?: boolean
  remark?: string | null
}
export type UpdateLlmPayload = Partial<Omit<CreateLlmPayload, 'usageType'>>

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
  vectorWeight?: number
}

export interface RecallTestResultItem {
  chunkId: number
  documentId: number
  documentName: string
  chunkIndex: number
  score: number
  rerankScore?: number
  vectorScore?: number
  textScore?: number
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
  vectorWeight?: number
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

export const getAiAppPublishConfigApi = async (id: number): Promise<AiAppPublishConfig> => {
  return request.get(`/ai/apps/${id}/publish-config`)
}

export const publishAiAppConfigApi = async (id: number): Promise<AiAppPublishConfig> => {
  return request.post(`/ai/apps/${id}/publish-config/publish`)
}

export const unpublishAiAppConfigApi = async (id: number): Promise<AiAppPublishConfig> => {
  return request.post(`/ai/apps/${id}/publish-config/unpublish`)
}

export const getStandaloneAiAppApi = async (
  id: number,
  options: { suppressErrorNotify?: boolean } = {},
): Promise<StandaloneAiAppMeta> => {
  return request.get(`/ai/apps/${id}/standalone`, {
    suppressErrorNotify: options.suppressErrorNotify,
  })
}

export const listStandaloneChatSessionsApi = async (
  appId: number,
  params: PageParams = {},
): Promise<PageResult<StandaloneChatSessionItem>> => {
  return request.get(`/ai/apps/${appId}/standalone/sessions`, { params })
}

export const listStandaloneChatMessagesApi = async (
  appId: number,
  sessionId: number,
  params: PageParams = {},
): Promise<PageResult<StandaloneChatMessageItem>> => {
  return request.get(`/ai/apps/${appId}/standalone/sessions/${sessionId}/messages`, { params })
}

export const updateStandaloneChatSessionApi = async (
  appId: number,
  sessionId: number,
  payload: { title: string },
): Promise<StandaloneChatSessionItem> => {
  return request.patch(`/ai/apps/${appId}/standalone/sessions/${sessionId}`, payload)
}

export const deleteStandaloneChatSessionApi = async (
  appId: number,
  sessionId: number,
): Promise<{ id: number }> => {
  return request.delete(`/ai/apps/${appId}/standalone/sessions/${sessionId}`)
}

export const pinStandaloneChatSessionApi = async (
  appId: number,
  sessionId: number,
): Promise<StandaloneChatSessionItem> => {
  return request.post(`/ai/apps/${appId}/standalone/sessions/${sessionId}/pin`)
}

export const unpinStandaloneChatSessionApi = async (
  appId: number,
  sessionId: number,
): Promise<StandaloneChatSessionItem> => {
  return request.post(`/ai/apps/${appId}/standalone/sessions/${sessionId}/unpin`)
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

export const getAiAppMemoryApi = async (appId: number): Promise<AppChatMemory> => {
  return request.get(`/ai/apps/${appId}/memory`)
}

export const updateAiAppMemoryApi = async (
  appId: number,
  payload: { content: string },
): Promise<AppChatMemory> => {
  return request.put(`/ai/apps/${appId}/memory`, payload)
}

export const getAiAppStatsApi = async (appId: number, days: 7 | 30 = 7): Promise<AiAppStats> => {
  return request.get(`/ai/apps/${appId}/stats`, { params: { days } })
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
  sessionId?: number
  message: string
  attachmentFileIds?: number[]
  onContent: (content: string) => void
  onAudioStart?: (payload: { contentType: string }) => void
  onAudioChunk?: (payload: { contentType: string; data: string }) => void
  onAudioEnd?: () => void
  onAudioError?: (message: string) => void
  onSession?: (payload: {
    sessionId: number
    userMessageId: number
    assistantMessageId: number
  }) => void
  onMeta?: (meta: { elapsedMs: number; tokens?: number }) => void
  onKnowledge?: (payload: { query: string; items: AppKnowledgeCitation[] }) => void
  onAttachments?: (payload: { query: string; items: AppAttachmentCitation[] }) => void
  onStatus?: (status: string) => void
  onSuggestions?: (items: string[]) => void
  onError?: (message: string) => void
  signal?: AbortSignal
  endpoint?: string
}

export const streamAiAppDebugApi = async ({
  appId,
  sessionId,
  message,
  attachmentFileIds,
  onContent,
  onAudioStart,
  onAudioChunk,
  onAudioEnd,
  onAudioError,
  onSession,
  onMeta,
  onKnowledge,
  onAttachments,
  onStatus,
  onSuggestions,
  onError,
  signal,
  endpoint,
}: StreamAiAppDebugParams) => {
  const baseURL = import.meta.env.VITE_API_BASE_URL || ''
  const token = getAccessToken()
  const response = await fetch(`${baseURL}${endpoint ?? `/ai/apps/${appId}/debug/stream`}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId, message, attachmentFileIds }),
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
      sessionId?: number
      userMessageId?: number
      assistantMessageId?: number
      items?: string[] | AppKnowledgeCitation[] | AppAttachmentCitation[]
      status?: string
      contentType?: string
      data?: string
    }
    if (eventName === 'error') {
      onError?.((payload as { message?: string }).message || '调试接口请求失败')
      return
    }
    if (eventName === 'audio-start') {
      onAudioStart?.({
        contentType: typeof payload.contentType === 'string' ? payload.contentType : 'audio/mpeg',
      })
      return
    }
    if (eventName === 'audio') {
      if (typeof payload.data === 'string' && payload.data) {
        onAudioChunk?.({
          contentType: typeof payload.contentType === 'string' ? payload.contentType : 'audio/mpeg',
          data: payload.data,
        })
      }
      return
    }
    if (eventName === 'audio-end') {
      onAudioEnd?.()
      return
    }
    if (eventName === 'audio-error') {
      onAudioError?.((payload as { message?: string }).message || '语音合成失败')
      return
    }
    if (eventName === 'status') {
      if (typeof payload.status === 'string' && payload.status.trim()) {
        onStatus?.(payload.status.trim())
      }
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
    if (
      eventName === 'session' &&
      typeof payload.sessionId === 'number' &&
      typeof payload.userMessageId === 'number' &&
      typeof payload.assistantMessageId === 'number'
    ) {
      onSession?.({
        sessionId: payload.sessionId,
        userMessageId: payload.userMessageId,
        assistantMessageId: payload.assistantMessageId,
      })
      return
    }
    if (eventName === 'knowledge') {
      onKnowledge?.({
        query: typeof payload.query === 'string' ? payload.query : '',
        items: Array.isArray(payload.items) ? (payload.items as AppKnowledgeCitation[]) : [],
      })
      return
    }
    if (eventName === 'attachments') {
      onAttachments?.({
        query: typeof payload.query === 'string' ? payload.query : '',
        items: Array.isArray(payload.items) ? (payload.items as AppAttachmentCitation[]) : [],
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

export const streamStandaloneAiAppApi = async (
  params: Omit<StreamAiAppDebugParams, 'endpoint'>,
) => {
  return streamAiAppDebugApi({
    ...params,
    endpoint: `/ai/apps/${params.appId}/standalone/stream`,
  })
}

export const transcribeAiAppSpeechApi = async (
  appId: number,
  fileId: number,
): Promise<{ text: string }> => {
  return request.post(`/ai/apps/${appId}/speech/transcriptions`, { fileId })
}

export const transcribeStandaloneAiAppSpeechApi = async (
  appId: number,
  fileId: number,
): Promise<{ text: string }> => {
  return request.post(`/ai/apps/${appId}/standalone/speech/transcriptions`, { fileId })
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
