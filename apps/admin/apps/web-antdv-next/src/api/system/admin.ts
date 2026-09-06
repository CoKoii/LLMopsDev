import { requestClient } from '#/api/request';

export namespace AdminApi {
  export type UserStatus = 'active' | 'disabled' | 'locked';

  export interface Permission {
    id: number;
    code: string;
    description?: null | string;
    status: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface Role {
    id: number;
    roleName: string;
    description?: null | string;
    status: boolean;
    permissions?: Permission[];
    createdAt?: string;
    updatedAt?: string;
  }

  export interface User {
    id: number;
    username: string;
    status: UserStatus;
    profile?: {
      avatar?: null | string;
      nickname?: null | string;
    } | null;
    roles?: Role[];
    createdAt?: string;
    updatedAt?: string;
  }

  export interface PageResult<T> {
    items: T[];
    page: number;
    pageSize: number;
    pages: number;
    total: number;
  }

  export interface UserPayload {
    profile?: { nickname?: string };
    roles?: number[];
    status?: UserStatus;
  }

  export interface RolePayload {
    description?: string;
    permissions?: number[];
    roleName: string;
    status?: boolean;
  }

  export interface PermissionPayload {
    code: string;
    description?: string;
    status?: boolean;
  }
}

export function getAdminUserListApi(params: {
  nickname?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<AdminApi.PageResult<AdminApi.User>>('/users', {
    params,
  });
}

export function updateAdminUserApi(id: number, data: AdminApi.UserPayload) {
  return requestClient.put(`/users/${id}`, data);
}

export function getAdminRoleListApi(params: {
  page?: number;
  pageSize?: number;
  roleName?: string;
}) {
  return requestClient.get<AdminApi.PageResult<AdminApi.Role>>('/roles', {
    params,
  });
}

export function createAdminRoleApi(data: AdminApi.RolePayload) {
  return requestClient.post('/roles', data);
}

export function updateAdminRoleApi(
  id: number,
  data: Partial<AdminApi.RolePayload>,
) {
  return requestClient.put(`/roles/${id}`, data);
}

export function getAdminPermissionListApi(params: {
  code?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<AdminApi.PageResult<AdminApi.Permission>>(
    '/permissions',
    { params },
  );
}

export function createAdminPermissionApi(data: AdminApi.PermissionPayload) {
  return requestClient.post('/permissions', data);
}

export function updateAdminPermissionApi(
  id: number,
  data: Partial<AdminApi.PermissionPayload>,
) {
  return requestClient.put(`/permissions/${id}`, data);
}
