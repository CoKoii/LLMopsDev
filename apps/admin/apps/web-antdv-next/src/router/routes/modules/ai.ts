import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
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
    ],
  },
];

export default routes;
