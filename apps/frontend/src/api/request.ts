import axios from 'axios'
import { message } from 'antdv-next'
import router from '@/router'
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

// 添加请求拦截器
request.interceptors.request.use(
  function (config) {
    // 在请求发送之前执行某些操作
    config.headers.Authorization = `Bearer ${JSON.parse(localStorage.getItem('auth')!)?.accessToken}`
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
    switch (error.response?.status) {
      case 401:
        message.warning('您的登录状态已过期，请重新登录以继续。')
        router.push('/login')
        break
      case 403:
        message.warning('您没有权限访问该资源。')
        break
      case 404:
        message.warning('请求的资源不存在。')
        break
      case 500:
        message.error('服务器内部错误，请稍后再试')
        break
      default:
        message.error(`请求失败: ${error.message}`)
    }

    // 处理响应错误
    return Promise.reject(error)
  },
)

export default request
