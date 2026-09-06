import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:bot',
      order: -10,
      title: 'AI 管理',
    },
    name: 'AiManagement',
    path: '/ai',
    redirect: '/ai/models',
    children: [
      {
        name: 'AiModels',
        path: 'models',
        component: () => import('#/views/ai/model-management/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:brain-circuit',
          title: '模型管理',
        },
      },
      {
        name: 'LegacyAiModelRoutes',
        path: ':legacy(chat-models|structured-models|embedding-models|multimodal-models|rerank-models|speech-to-text-models|text-to-speech-models)',
        redirect: '/ai/models',
        meta: {
          activePath: '/ai/models',
          hideInMenu: true,
          hideInTab: true,
          title: '模型管理',
        },
      },
      {
        name: 'AiAgents',
        path: 'agents',
        component: () => import('#/views/operations/agents/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:bot',
          title: '智能体管理',
        },
      },
      {
        name: 'AiPlugins',
        path: 'plugins',
        component: () => import('#/views/operations/plugins/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:blocks',
          title: '插件管理',
        },
      },
      {
        name: 'AiKnowledge',
        path: 'knowledge',
        component: () => import('#/views/operations/knowledge/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:database-zap',
          title: '知识库管理',
        },
      },
    ],
  },
];

export default routes;
