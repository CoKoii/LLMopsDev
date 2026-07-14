import { ref } from 'vue'
import { defineStore } from 'pinia'
import { loginApi, getUserInfoApi, type LoginParams } from '../api/core/auth'
import { message } from 'antdv-next'
import { refreshAccessTokenApi } from '../api/core/auth'
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
    }

    return { accessToken, refreshToken, userInfo, getUserInfo, authLogin, refreshAccessToken }
  },
  {
    persist: {
      pick: ['accessToken', 'refreshToken'],
    },
  },
)
