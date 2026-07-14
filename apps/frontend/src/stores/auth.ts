import { ref } from 'vue'
import { defineStore } from 'pinia'
import { loginApi, getUserInfoApi, type LoginParams } from '../api/core/auth'
import { message } from 'antdv-next'
export const useAuthStore = defineStore(
  'auth',
  () => {
    const accessToken = ref()
    const refreshToken = ref()
    const userInfo = ref()
    // 登录函数
    const authLogin = async (params: LoginParams) => {
      // 先进行登录
      const loginRes = await loginApi(params)
      // 登录成功后，保存 accessToken 和 refreshToken
      accessToken.value = loginRes.accessToken
      refreshToken.value = loginRes.refreshToken
      // 用accessToken获取用户信息
      const userInfoRes = await getUserInfoApi()
      userInfo.value = userInfoRes
      message.success('登录成功')
    }

    return { accessToken, refreshToken, userInfo, authLogin }
  },
  {
    persist: {
      pick: ['accessToken', 'refreshToken'],
    },
  },
)
