import { Astroid, Blocks, CodeXml, LayoutGrid, User } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../components/Layouts/HomeLayout/HomeLayout.vue'),
    children: [
      {
        path: '/',
        name: 'home',
        meta: {
          title: '主页',
          icon: LayoutGrid,
        },
        component: () => import('../views/home/index.vue'),
      },
      {
        path: '/personal-space',
        name: 'personal-space',
        meta: {
          title: '个人空间',
          icon: User,
        },
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/apps',
        name: 'apps',
        meta: {
          title: '应用广场',
          icon: Astroid,
          tag: '探索',
        },
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/plugins',
        name: 'plugins',
        meta: {
          title: '插件广场',
          icon: Blocks,
        },
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/open-api',
        name: 'open-api',
        meta: {
          title: '开放API',
          icon: CodeXml,
        },
        component: () => import('../views/personalSpace/index.vue'),
      },
    ],
  },
]
