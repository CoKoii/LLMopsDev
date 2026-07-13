import request from '../request'

export type LoginParams = {
  username: string
  password: string
}

type LoginResponse = {
  accessToken: string
  refreshToken: string
}

// 登录接口
export const loginApi = async (params: LoginParams): Promise<LoginResponse> => {
  return request.post('/auth/login', params)
}

// 获取用户信息接口
export const getUserInfoApi = async () => {
  return request.get('/auth/userinfo')
}
