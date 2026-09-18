import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:settings-2',
      order: -9,
      title: '系统管理',
    },
    name: 'SystemManagement',
    path: '/system',
    redirect: '/system/users',
    children: [
      {
        name: 'SystemUsers',
        path: 'users',
        component: () => import('#/views/system/user/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:users',
          title: '用户管理',
        },
      },
      {
        name: 'SystemRoles',
        path: 'roles',
        component: () => import('#/views/system/role/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:shield-check',
          title: '角色管理',
        },
      },
      {
        name: 'SystemPermissions',
        path: 'permissions',
        component: () => import('#/views/system/permission/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'lucide:key-round',
          title: '权限管理',
        },
      },
    ],
  },
];

export default routes;
