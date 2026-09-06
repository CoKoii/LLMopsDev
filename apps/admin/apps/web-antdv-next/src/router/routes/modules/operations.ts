import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'OperationsDashboard',
    path: '/operations',
    component: () => import('#/views/operations/index.vue'),
    meta: {
      authority: ['admin'],
      icon: 'lucide:activity',
      order: -20,
      title: '运维监控',
    },
  },
];

export default routes;
