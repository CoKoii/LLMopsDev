import axios from 'axios'

const request = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { 'X-Custom-Header': 'foobar' },
})

// 添加请求拦截器
request.interceptors.request.use(
  function (config) {
    // 在请求发送之前执行某些操作
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
    return response
  },
  function (error) {
    // 状态码不在 2xx 范围内的响应会触发此函数
    // 处理响应错误
    return Promise.reject(error)
  },
)
