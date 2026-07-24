import { Astroid, Blocks, CodeXml, LayoutGrid, User } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const mainRoutes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'home',
    meta: {
      title: '主页',
      icon: LayoutGrid,
      pageTransition: 'workspace-rise',
      shellKey: 'home',
    },
    component: () => import('../views/home/index.vue'),
  },
  {
    path: 'personal-space',
    name: 'personal-space',
    meta: {
      title: '个人空间',
      icon: User,
      pageTransition: 'workspace-fade',
      shellKey: 'personal-space',
    },
    component: () => import('../views/personalSpace/index.vue'),
    redirect: { name: 'personal-space-apps' },
    children: [
      {
        path: 'apps',
        name: 'personal-space-apps',
        meta: {
          title: 'AI应用',
          pageTransition: 'workspace-fade',
        },
        component: () => import('../views/personalSpace/apps/index.vue'),
      },
      {
        path: 'plugins',
        name: 'personal-space-plugins',
        meta: {
          title: '插件',
          pageTransition: 'workspace-fade',
        },
        component: () => import('../views/personalSpace/plugins/index.vue'),
      },
      {
        path: 'workflows',
        name: 'personal-space-workflows',
        meta: {
          title: '工作流',
          pageTransition: 'workspace-fade',
        },
        component: () => import('../views/personalSpace/workflows/index.vue'),
      },
      {
        path: 'knowledge',
        name: 'personal-space-knowledge',
        meta: {
          title: '知识库',
          pageTransition: 'workspace-fade',
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
      pageTransition: 'workspace-fade',
      shellKey: 'apps',
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
      pageTransition: 'workspace-fade',
      shellKey: 'plugins',
    },
    component: () => import('../views/plugins/index.vue'),
  },
  {
    path: 'open-api',
    name: 'open-api',
    meta: {
      title: '开放API',
      icon: CodeXml,
      pageTransition: 'workspace-fade',
      shellKey: 'open-api',
    },
    component: () => import('../views/openAPI/index.vue'),
    redirect: { name: 'open-api-quick-start' },
    children: [
      {
        path: 'quick-start',
        name: 'open-api-quick-start',
        meta: {
          title: '快速开始',
          pageTransition: 'workspace-fade',
        },
        component: () => import('../views/openAPI/quickStart/index.vue'),
      },
      {
        path: 'keys',
        name: 'open-api-keys',
        meta: {
          title: '秘钥',
          pageTransition: 'workspace-fade',
        },
        component: () => import('../views/openAPI/keys/index.vue'),
      },
    ],
  },
]

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../components/Layouts/SidebarLayout/SidebarLayout.vue'),
    meta: {
      appTransition: 'app-shell',
    },
    children: [
      ...mainRoutes,
      {
        path: 'personal-space/knowledge/:knowledgeId/files',
        name: 'knowledge-files',
        meta: {
          title: '知识库详情',
          activeMenu: 'personal-space',
          pageTransition: 'workspace-fade',
          shellKey: 'knowledge-files',
        },
        component: () => import('../views/personalSpace/knowledge/detail.vue'),
      },
      {
        path: 'personal-space/knowledge/:knowledgeId/files/add',
        name: 'knowledge-files-add',
        meta: {
          title: '添加文件',
          activeMenu: 'personal-space',
          pageTransition: 'workspace-fade',
          shellKey: 'knowledge-files',
        },
        component: () => import('../views/personalSpace/knowledge/add/index.vue'),
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    meta: {
      title: '登录',
      appTransition: 'app-shell',
    },
    component: () => import('../views/login/index.vue'),
  },
  {
    path: '/apps/orchestration/:appId',
    redirect: (to) => ({
      name: 'app-orchestration',
      params: {
        appId: to.params.appId,
        page: 'edit',
      },
    }),
    meta: {
      title: '应用编排',
      appTransition: 'page-forward',
    },
  },
  {
    path: '/apps/orchestration/:appId/:page(edit|publish|stats)',
    name: 'app-orchestration',
    meta: {
      title: '应用编排',
      appTransition: 'page-forward',
    },
    component: () => import('../views/appOrchestration/index.vue'),
  },
]
