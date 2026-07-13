import request from '../request'

export type LoginParams = {
  username: string
  password: string
}

// 登录接口
export const loginApi = async (params: LoginParams) => {
  return request.post('/auth/login', params)
}

// 获取用户信息接口
export const getUserInfoApi = async () => {
  return request.get('/auth/userinfo')
}
