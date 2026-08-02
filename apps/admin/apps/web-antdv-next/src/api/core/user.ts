import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

interface BackendProfile {
  id: number;
  username: string;
  profile?: {
    avatar?: null | string;
    nickname?: null | string;
  } | null;
  roles?: string[];
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  const profile = await requestClient.get<BackendProfile>('/profiles/me');
  return {
    avatar: profile.profile?.avatar ?? '',
    desc: '',
    homePath: '/ai/models',
    realName: profile.profile?.nickname ?? profile.username,
    roles: profile.roles ?? [],
    token: '',
    userId: String(profile.id),
    username: profile.username,
  } satisfies UserInfo;
}
