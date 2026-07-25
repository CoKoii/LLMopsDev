import { createPinia } from 'pinia'
import { createApp } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import '@/styles/index.scss'
import 'normalize.css'
import App from './App.vue'
import router from './router'
import { setAuthLifecycleHandlers } from './api/request'
import { setAuthRedirectHandler, useAuthStore } from './stores/auth'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.use(router)

const redirectToLogin = () => {
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' })
  }
}

setAuthLifecycleHandlers({
  refreshAccessToken: async () => {
    const refreshRes = await useAuthStore().refreshAccessToken()
    return refreshRes.accessToken
  },
  clearAuth: () => {
    useAuthStore().clearAuth()
  },
  redirectToLogin,
})
setAuthRedirectHandler(redirectToLogin)

app.mount('#app')
