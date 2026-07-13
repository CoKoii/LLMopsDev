import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/auth'
import { refreshAccessTokenApi } from './core/auth'
const request = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 5000,
})

type RetryConfig = InternalAxiosRequestConfig & {
  // 标记当前请求是否已经因为 401 重试过，防止死循环
  _retry?: boolean
}

// 是否正在刷新 token
let isRefreshing = false

// refresh 期间，如果同时有多个请求 401，先挂起等待
let refreshQueue: Array<(token: string) => void> = []

// refresh 成功后，唤醒所有等待中的请求
function resolveRefreshQueue(token: string) {
  refreshQueue.forEach((callback) => callback(token))
  refreshQueue = []
}

// 清除登录状态并跳转登录页
function logout() {
  const authStore = useAuthStore()

  authStore.accessToken = undefined
  authStore.refreshToken = undefined
  authStore.userInfo = undefined

  localStorage.removeItem('auth')

  // 避免在 request.ts 里强依赖 router，减少循环依赖风险
  window.location.replace('/login')
}

// 请求拦截器：普通接口带 accessToken，refresh 接口带 refreshToken
request.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()

    const isRefreshRequest = config.url === '/auth/refresh'

    if (isRefreshRequest) {
      if (authStore.refreshToken) {
        config.headers.Authorization = `Bearer ${authStore.refreshToken}`
      }
    } else {
      if (authStore.accessToken) {
        config.headers.Authorization = `Bearer ${authStore.accessToken}`
      }
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// 响应拦截器：处理 401，无感刷新 token
request.interceptors.response.use(
  (response) => {
    return response.data.data
  },
  async (error: AxiosError) => {
    const authStore = useAuthStore()
    const originalConfig = error.config as RetryConfig | undefined

    // 不是 401，或者没有原始请求配置，直接抛出
    if (error.response?.status !== 401 || !originalConfig) {
      return Promise.reject(error)
    }

    // 如果 refresh 接口自己也 401，说明 refreshToken 也失效了
    if (originalConfig.url === '/auth/refresh') {
      logout()
      return Promise.reject(error)
    }

    // 当前请求已经重试过一次了，仍然 401，直接退出登录
    if (originalConfig._retry) {
      logout()
      return Promise.reject(error)
    }

    originalConfig._retry = true

    // 如果已经有 refresh 请求在进行中，当前请求进入队列等待
    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((newAccessToken: string) => {
          originalConfig.headers.Authorization = `Bearer ${newAccessToken}`
          resolve(request(originalConfig))
        })
      })
    }

    isRefreshing = true

    try {
      // 这里会自动走请求拦截器，并携带 refreshToken
      const refreshRes = await refreshAccessTokenApi()

      // 保存新的 token
      authStore.accessToken = refreshRes.accessToken
      authStore.refreshToken = refreshRes.refreshToken

      // 唤醒 refresh 期间挂起的其他请求
      resolveRefreshQueue(refreshRes.accessToken)

      // 用新 accessToken 重试当前失败的请求
      originalConfig.headers.Authorization = `Bearer ${refreshRes.accessToken}`

      return request(originalConfig)
    } catch (refreshError) {
      // refresh 失败，清空本地登录状态
      logout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default request
