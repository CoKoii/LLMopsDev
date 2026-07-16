import request from '../request'

// 登录接口
export type LoginParams = {
  username: string
  password: string
}

type LoginResponse = {
  accessToken: string
  refreshToken: string
}
export const loginApi = async (params: LoginParams): Promise<LoginResponse> => {
  return request.post('/auth/login', params, {
    authAction: 'login',
  })
}

// 退出登录接口
export const logoutApi = async () => {
  return request.post('/auth/logout')
}

// 获取用户信息接口
export const getUserInfoApi = async () => {
  return request.get('/profiles/me')
}

export type UpdateCurrentProfileParams = {
  nickname: string
}

export const updateCurrentProfileApi = async (params: UpdateCurrentProfileParams) => {
  return request.put('/profiles/me', params)
}

export type ChangeCurrentPasswordParams = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export const changeCurrentPasswordApi = async (params: ChangeCurrentPasswordParams) => {
  return request.put('/profiles/me/password', params)
}

// 刷新accessToken接口
export type RefreshResponse = {
  accessToken: string
  refreshToken: string
}

export const refreshAccessTokenApi = async (): Promise<RefreshResponse> => {
  const auth = JSON.parse(localStorage.getItem('auth') || '{}')
  return request.post('/auth/refresh', undefined, {
    authAction: 'refresh',
    headers: {
      Authorization: `Bearer ${auth.refreshToken}`,
    },
  })
}
