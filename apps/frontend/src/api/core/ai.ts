import request from '../request'

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
}

export interface LlmItem {
  id: number
  provider: string
  modelName: string
  url: string
  apiKey: string
  createdAt?: string
  updatedAt?: string
}

export interface AiAppItem {
  id: number
  name: string
  image?: string | null
  description?: string | null
  llmId?: number | null
  llm?: LlmItem | null
  status: boolean
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
  openapiSchema: string
  headers?: PluginHeader[] | null
  status: boolean
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

export type CreateLlmPayload = Omit<LlmItem, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateLlmPayload = Partial<CreateLlmPayload>

export interface CreateAiAppPayload {
  name: string
  image?: string
  imageFileId?: number
  description?: string
  llmId?: number | null
  status?: boolean
}

export type UpdateAiAppPayload = Partial<CreateAiAppPayload>

export interface CreatePluginPayload {
  icon?: string
  iconFileId?: number
  name: string
  description?: string
  openapiSchema: string
  headers?: PluginHeader[]
  status?: boolean
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

export const createAiAppApi = async (payload: CreateAiAppPayload) => {
  return request.post('/ai/apps', payload)
}

export const updateAiAppApi = async (id: number, payload: UpdateAiAppPayload) => {
  return request.put(`/ai/apps/${id}`, payload)
}

export const deleteAiAppApi = async (id: number) => {
  return request.delete(`/ai/apps/${id}`)
}

export const listPluginsApi = async (params?: PageParams): Promise<PageResult<PluginItem>> => {
  return request.get('/ai/plugins', { params })
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

export const createKnowledgeApi = async (payload: CreateKnowledgePayload) => {
  return request.post('/ai/knowledge', payload)
}

export const updateKnowledgeApi = async (id: number, payload: UpdateKnowledgePayload) => {
  return request.put(`/ai/knowledge/${id}`, payload)
}

export const deleteKnowledgeApi = async (id: number) => {
  return request.delete(`/ai/knowledge/${id}`)
}
