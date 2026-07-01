import { Astroid, Blocks, CodeXml, LayoutGrid, User } from '@lucide/vue'
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
    component: () => import('../components/Layouts/HomeLayout/HomeLayout.vue'),
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
        path: '/apps',
        name: '应用广场',
        icon: Astroid,
        tag: '探索',
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/plugins',
        name: '插件广场',
        icon: Blocks,
        component: () => import('../views/personalSpace/index.vue'),
      },
      {
        path: '/open-api',
        name: '开放API',
        icon: CodeXml,
        component: () => import('../views/personalSpace/index.vue'),
      },
    ],
  },
]
