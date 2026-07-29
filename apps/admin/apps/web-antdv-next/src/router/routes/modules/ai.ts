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
    redirect: '/ai/chat-models',
    children: [
      {
        name: 'AiChatModels',
        path: 'chat-models',
        component: () => import('#/views/ai/model-management/chat.vue'),
        meta: {
          affixTab: true,
          icon: 'lucide:brain-circuit',
          title: '通用对话',
        },
      },
      {
        name: 'AiStructuredModels',
        path: 'structured-models',
        component: () => import('#/views/ai/model-management/structured.vue'),
        meta: {
          icon: 'lucide:braces',
          title: '格式处理',
        },
      },
      {
        name: 'AiEmbeddingModels',
        path: 'embedding-models',
        component: () => import('#/views/ai/model-management/embedding.vue'),
        meta: {
          icon: 'lucide:scan-search',
          title: 'Embedding',
        },
      },
      {
        name: 'AiMultimodalModels',
        path: 'multimodal-models',
        component: () => import('#/views/ai/model-management/multimodal.vue'),
        meta: {
          icon: 'lucide:image',
          title: '多模态',
        },
      },
      {
        name: 'AiRerankModels',
        path: 'rerank-models',
        component: () => import('#/views/ai/model-management/rerank.vue'),
        meta: {
          icon: 'lucide:arrow-down-up',
          title: 'Rerank',
        },
      },
    ],
  },
];

export default routes;
