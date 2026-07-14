import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './menus'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (to.name === 'login') {
    return true
  }

  if (await authStore.getUserInfo()) {
    return true
  }
})
export default router
