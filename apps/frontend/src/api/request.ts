import axios from 'axios'
import { message } from 'antdv-next'
import router from '@/router'
import { getAccessToken } from '@/utils/auth'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

// 添加请求拦截器
request.interceptors.request.use(
  function (config) {
    // 在请求发送之前执行某些操作
    const token = getAccessToken()

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
  function (error) {
    message.error(error.response?.data?.message)
    if (error.response?.status === 401 || error.response?.status === 403) {
      router.push({ name: 'login' })
    }

    // 处理响应错误
    return Promise.reject(error)
  },
)

export default request
