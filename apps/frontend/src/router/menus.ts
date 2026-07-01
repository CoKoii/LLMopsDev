import { LayoutGrid, User } from '@lucide/vue'
import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

type MenuRoute = RouteRecordRaw & {
  tag?: string
  icon?: Component
  children?: MenuRoute[]
}
export const routes: MenuRoute[] = [
  {
    path: '/',
    children: [
      {
        path: '/',
        name: '主页',
        icon: LayoutGrid,
        component: () => import('../views/home/index.vue'),
      },
      {
        path: '/personal-space',
        name: '个人空间',
        icon: User,
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/personal-space',
        name: '个人空间',
        icon: User,
        tag: '探索',
        component: () => import('../views/personalSpace/index.vue'),
      },
    ],
  },

  {
    path: '/personal-space',
    name: '个人空间',
    icon: User,
    component: () => import('../views/personalSpace/index.vue'),
  },
  {
    path: '/personal-space',
    name: '个人空间',
    icon: User,
    component: () => import('../views/personalSpace/index.vue'),
  },
  {
    path: '/personal-space',
    name: '个人空间',
    icon: User,
    component: () => import('../views/personalSpace/index.vue'),
  },
]
