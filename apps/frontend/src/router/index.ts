import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/home/index.vue'),
    },
    {
      path: '/personal-space',
      name: 'personal-space',
      component: () => import('../views/personalSpace/index.vue'),
    },
  ],
})

export default router
