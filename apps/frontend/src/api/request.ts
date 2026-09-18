import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antdv-next'
import { getAccessToken } from '@/utils/auth'

type ApiErrorData = {
  message?: string
}

type RetryRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

type AuthLifecycleHandlers = {
  refreshAccessToken?: () => Promise<string | undefined>
  clearAuth?: () => void
  redirectToLogin?: () => void
}

let authLifecycleHandlers: AuthLifecycleHandlers = {}
let refreshPromise: Promise<string | undefined> | undefined

// request 不直接依赖 store，避免 auth store -> api -> request 的循环依赖继续变重。
export const setAuthLifecycleHandlers = (handlers: AuthLifecycleHandlers) => {
  authLifecycleHandlers = handlers
}

const setAuthorizationHeader = (config: InternalAxiosRequestConfig, token: string) => {
  config.headers = AxiosHeaders.from(config.headers)
  config.headers.set('Authorization', `Bearer ${token}`)
}

const hasAuthorizationHeader = (config: InternalAxiosRequestConfig) => {
  return AxiosHeaders.from(config.headers).has('Authorization')
}

const notifyError = (error: AxiosError<ApiErrorData>) => {
  if (error.config?.suppressErrorNotify) return

  message.error(error.response?.data?.message || error.message || '请求失败')
}

const redirectToLogin = () => {
  authLifecycleHandlers.clearAuth?.()
  authLifecycleHandlers.redirectToLogin?.()
}

const refreshAccessTokenOnce = () => {
  const refreshAccessToken = authLifecycleHandlers.refreshAccessToken
  if (!refreshAccessToken) {
    return Promise.resolve(undefined)
  }

  // 多个接口同时 401 时共用一次刷新，避免重复刷新和重复提示。
  refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = undefined
  })
  return refreshPromise
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

// 添加请求拦截器
request.interceptors.request.use(
  function (config) {
    // 在请求发送之前执行某些操作
    const token = getAccessToken()

    if (token && !hasAuthorizationHeader(config)) {
      setAuthorizationHeader(config, token)
    }
    return config
  },
  function (error) {
    // 处理请求错误
    return Promise.reject(error)
  },
)

// 添加响应拦截器
request.interceptors.response.use(
  function (response) {
    // 状态码在 2xx 范围内的响应会触发此函数
    // 处理响应数据
    return response.data.data
  },
  async function (error: AxiosError<ApiErrorData>) {
    const originalRequest = error.config as RetryRequestConfig | undefined
    const status = error.response?.status
    const authAction = originalRequest?.authAction

    if (status === 403) {
      notifyError(error)
      return Promise.reject(error)
    }

    if (status !== 401 || !originalRequest) {
      notifyError(error)
      return Promise.reject(error)
    }

    if (authAction === 'login') {
      notifyError(error)
      return Promise.reject(error)
    }

    if (authAction === 'refresh' || originalRequest._retry) {
      notifyError(error)
      redirectToLogin()
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const accessToken = await refreshAccessTokenOnce()

      if (!accessToken) {
        notifyError(error)
        redirectToLogin()
        return Promise.reject(error)
      }

      setAuthorizationHeader(originalRequest, accessToken)
      return request(originalRequest)
    } catch (refreshError) {
      if (!axios.isAxiosError(refreshError)) {
        redirectToLogin()
      }
      return Promise.reject(refreshError)
    }
  },
)

export default request
