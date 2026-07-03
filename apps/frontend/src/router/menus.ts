import { Astroid, Blocks, CodeXml, LayoutGrid, User } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const mainRoutes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'home',
    meta: {
      title: '主页',
      icon: LayoutGrid,
    },
    component: () => import('../views/home/index.vue'),
  },
  {
    path: 'personal-space',
    name: 'personal-space',
    meta: {
      title: '个人空间',
      icon: User,
    },
    redirect: { name: 'personal-space-apps' },
    children: [
      {
        path: 'apps',
        name: 'personal-space-apps',
        meta: {
          title: 'AI应用',
        },
        component: () => import('../views/personalSpace/apps/index.vue'),
      },
      {
        path: 'plugins',
        name: 'personal-space-plugins',
        meta: {
          title: '插件',
        },
        component: () => import('../views/personalSpace/plugins/index.vue'),
      },
      {
        path: 'workflows',
        name: 'personal-space-workflows',
        meta: {
          title: '工作流',
        },
        component: () => import('../views/personalSpace/workflows/index.vue'),
      },
      {
        path: 'knowledge',
        name: 'personal-space-knowledge',
        meta: {
          title: '知识库',
        },
        component: () => import('../views/personalSpace/knowledge/index.vue'),
      },
    ],
  },
  {
    path: 'apps',
    name: 'apps',
    meta: {
      title: '应用广场',
      icon: Astroid,
      tag: '探索',
      activeMenu: 'apps',
    },
    component: () => import('../views/apps/index.vue'),
  },
  {
    path: 'plugins',
    name: 'plugins',
    meta: {
      title: '插件广场',
      icon: Blocks,
      activeMenu: 'plugins',
    },
    component: () => import('../views/plugins/index.vue'),
  },
  {
    path: 'open-api',
    name: 'open-api',
    meta: {
      title: '开放API',
      icon: CodeXml,
    },
    component: () => import('../views/openAPI/index.vue'),
  },
]

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../components/Layouts/SidebarLayout/SidebarLayout.vue'),
    children: mainRoutes,
  },
]
