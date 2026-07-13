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
      // 先进行登录
      const res = await loginApi(params)
      // 登录成功后，保存 accessToken 和 refreshToken
      accessToken.value = res.accessToken
      refreshToken.value = res.refreshToken
      //
      message.success('登录成功')
    }

    return { accessToken, refreshToken, authLogin }
  },
  {
    persist: true,
  },
)
