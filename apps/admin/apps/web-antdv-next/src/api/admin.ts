import { requestClient } from '#/api/request';

export namespace AdminOpsApi {
  export interface ResourceQuery {
    name?: string;
    page?: number;
    pageSize?: number;
    published?: boolean;
    status?: boolean;
  }

  export interface ResourceItem {
    id: number;
    name: string;
    description?: null | string;
    status: boolean;
    published?: boolean;
    categoryName?: null | string;
    ownerId?: null | number;
    ownerUsername?: null | string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface KnowledgeItem extends ResourceItem {
    chunkCount: number;
    documentCount: number;
    failedDocumentCount: number;
  }

  export interface PageResult<T> {
    items: T[];
    page: number;
    pageSize: number;
    pages: number;
    total: number;
  }

  export interface Overview {
    range: { days: 7 | 30; end: string; start: string };
    overview: {
      activeApps: number;
      activeUsers: number;
      enabledModels: number;
      failedDocuments: number;
      publishedApps: number;
      publishedPlugins: number;
      totalApps: number;
      totalChunks: number;
      totalDocuments: number;
      totalKnowledges: number;
      totalPlugins: number;
      totalUsers: number;
    };
    daily: Array<{
      activeUsers: number;
      avgLatencyMs: number;
      date: string;
      errors: number;
      messages: number;
      sessions: number;
      tokens: number;
    }>;
    topApps: Array<{ appId: number; name: string; sessions: number }>;
    modelHealth: Array<{
      enabled: boolean;
      healthy: boolean;
      id: number;
      lastTestStatus: 'failed' | 'success' | 'untested';
      lastTestedAt?: null | string;
      message?: null | string;
      modelName: string;
      usageType: string;
    }>;
  }
}

export function getAdminOverviewApi(days: 7 | 30 = 7) {
  return requestClient.get<AdminOpsApi.Overview>('/admin/overview', {
    params: { days },
  });
}

export function getAdminAppListApi(params: AdminOpsApi.ResourceQuery) {
  return requestClient.get<AdminOpsApi.PageResult<AdminOpsApi.ResourceItem>>(
    '/admin/apps',
    { params },
  );
}

export function updateAdminAppApi(
  id: number,
  data: Partial<Pick<AdminOpsApi.ResourceItem, 'published' | 'status'>>,
) {
  return requestClient.put(`/admin/apps/${id}`, data);
}

export function getAdminPluginListApi(params: AdminOpsApi.ResourceQuery) {
  return requestClient.get<AdminOpsApi.PageResult<AdminOpsApi.ResourceItem>>(
    '/admin/plugins',
    { params },
  );
}

export function updateAdminPluginApi(
  id: number,
  data: Partial<Pick<AdminOpsApi.ResourceItem, 'published' | 'status'>>,
) {
  return requestClient.put(`/admin/plugins/${id}`, data);
}

export function getAdminKnowledgeListApi(params: AdminOpsApi.ResourceQuery) {
  return requestClient.get<AdminOpsApi.PageResult<AdminOpsApi.KnowledgeItem>>(
    '/admin/knowledge',
    { params },
  );
}

export function updateAdminKnowledgeApi(id: number, data: { status: boolean }) {
  return requestClient.put(`/admin/knowledge/${id}`, data);
}
