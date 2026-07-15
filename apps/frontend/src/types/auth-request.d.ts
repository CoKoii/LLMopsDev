import 'axios'
import 'pinia-plugin-persistedstate'

declare module 'axios' {
  interface AxiosRequestConfig {
    authAction?: 'login' | 'refresh'
  }
}
