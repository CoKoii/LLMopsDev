import { requestClient } from '#/api/request';

export namespace AiModelApi {
  export type UsageType =
    | 'chat'
    | 'embedding'
    | 'multimodal'
    | 'rerank'
    | 'speech_to_text'
    | 'structured'
    | 'text_to_speech';
  export type TestStatus = 'failed' | 'success' | 'untested';

  export interface ModelConfig {
    id: number;
    usageType: UsageType;
    modelName: string;
    baseUrl: string;
    enabled: boolean;
    isDefault: boolean;
    apiKeyConfigured: boolean;
    lastTestStatus: TestStatus;
    lastTestMessage?: null | string;
    lastTestedAt?: null | string;
    remark?: null | string;
    createdAt: string;
    updatedAt: string;
    createdBy?: null | number;
    updatedBy?: null | number;
  }

  export interface ModelPayload {
    usageType: UsageType;
    modelName: string;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
    remark?: string;
  }

  export interface QueryParams {
    name?: string;
    page?: number;
    pageSize?: number;
    usageType?: UsageType;
  }
}

export function createAiModelApi(data: AiModelApi.ModelPayload) {
  return requestClient.post('/ai/llms', data);
}

export function deleteAiModelApi(id: number) {
  return requestClient.delete(`/ai/llms/${id}`);
}

export function getAiModelListApi(params: AiModelApi.QueryParams) {
  return requestClient.get<{
    items: AiModelApi.ModelConfig[];
    total: number;
  }>('/ai/llms', { params });
}

export function testAiModelApi(id: number) {
  return requestClient.post<{
    elapsedMs: number;
    message: string;
    success: boolean;
  }>(`/ai/llms/${id}/test`, { prompt: '请回复 ok' });
}

export function updateAiModelApi(
  id: number,
  data: Partial<AiModelApi.ModelPayload>,
) {
  return requestClient.put(`/ai/llms/${id}`, data);
}
