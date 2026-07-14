import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './menus'
import { useAuthStore } from '../stores/auth'
import { getUserInfoApi } from '../api/core/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (to.name === 'login') {
    return true
  }

  if (authStore.accessToken) {
    if (authStore.userInfo) {
      return true
    }

    try {
      await getUserInfoApi()
      return true
    } catch {
      return '/login'
    }
  }

  return '/login'
})
export default router
