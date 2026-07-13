import { ref } from 'vue'
import { defineStore } from 'pinia'
import { loginApi, type LoginParams } from '../api/core/auth'
import { message } from 'antdv-next'
export const useAuthStore = defineStore(
  'auth',
  () => {
    const accessToken = ref('')
    const refreshToken = ref('')

    const authLogin = async (params: LoginParams) => {
      const res = await loginApi(params)
      accessToken.value = res.accessToken
      refreshToken.value = res.refreshToken
      message.success('登录成功')
    }

    return { accessToken, refreshToken, authLogin }
  },
  {
    persist: true,
  },
)
