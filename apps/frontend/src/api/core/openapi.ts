import request from '../request'

export interface OpenApiKeyItem {
  id: number
  key: string
  status: boolean
  remark: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string | null
}

export interface CreatedOpenApiKey extends OpenApiKeyItem {
  secret: string
}

export type OpenApiKeyPayload = {
  status?: boolean
  remark?: string
}

export const listOpenApiKeysApi = async (): Promise<OpenApiKeyItem[]> => {
  return request.get('/openapi/keys')
}

export const createOpenApiKeyApi = async (
  payload: OpenApiKeyPayload,
): Promise<CreatedOpenApiKey> => {
  return request.post('/openapi/keys', payload)
}

export const updateOpenApiKeyApi = async (
  id: number,
  payload: OpenApiKeyPayload,
): Promise<OpenApiKeyItem> => {
  return request.patch(`/openapi/keys/${id}`, payload)
}

export const deleteOpenApiKeyApi = async (id: number): Promise<{ id: number }> => {
  return request.delete(`/openapi/keys/${id}`)
}
