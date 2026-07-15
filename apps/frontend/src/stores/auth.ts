import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  loginApi,
  logoutApi,
  getUserInfoApi,
  refreshAccessTokenApi,
  type LoginParams,
} from '../api/core/auth'
import { message } from 'antdv-next'
import { setAuthLifecycleHandlers } from '../api/request'
export const useAuthStore = defineStore(
  'auth',
  () => {
    const accessToken = ref()
    const refreshToken = ref()
    const userInfo = ref()
    // 获取用户信息函数
    const getUserInfo = async () => {
      if (userInfo.value) {
        return userInfo.value
      }
      const userInfoRes = await getUserInfoApi()
      userInfo.value = userInfoRes
      return userInfoRes
    }

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

    // 刷新accessToken函数
    const refreshAccessToken = async () => {
      const refreshRes = await refreshAccessTokenApi()
      accessToken.value = refreshRes.accessToken
      refreshToken.value = refreshRes.refreshToken
      return refreshRes
    }

    const clearAuth = () => {
      accessToken.value = undefined
      refreshToken.value = undefined
      userInfo.value = undefined
      localStorage.removeItem('auth')
    }

    // 退出登录函数
    const authLogout = async () => {
      try {
        await logoutApi()
        message.success('退出登录成功')
      } catch {
        // 接口失败也清除本地登录态，避免用户卡在当前会话。
      } finally {
        clearAuth()
      }

      const { default: router } = await import('../router')
      void router.replace({ name: 'login' })
    }

    return {
      accessToken,
      refreshToken,
      userInfo,
      getUserInfo,
      authLogin,
      authLogout,
      refreshAccessToken,
      clearAuth,
    }
  },
  {
    persist: {
      pick: ['accessToken', 'refreshToken'],
    },
  },
)

setAuthLifecycleHandlers({
  refreshAccessToken: async () => {
    const authStore = useAuthStore()
    const refreshRes = await authStore.refreshAccessToken()
    return refreshRes.accessToken
  },
  clearAuth: () => {
    useAuthStore().clearAuth()
  },
})
