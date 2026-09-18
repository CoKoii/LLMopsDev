import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '昵称关键词' },
      fieldName: 'nickname',
      label: '昵称',
    },
  ];
}

export function useColumns(): VxeTableGridColumns {
  return [
    { field: 'id', title: 'ID', width: 80 },
    { field: 'username', minWidth: 180, title: '用户名' },
    { field: 'profile.nickname', minWidth: 160, title: '昵称' },
    {
      field: 'roles',
      minWidth: 220,
      slots: { default: 'roles' },
      title: '角色',
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 110,
    },
    {
      field: 'createdAt',
      formatter: 'formatDateTime',
      title: '注册时间',
      width: 180,
    },
    {
      field: 'action',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 110,
    },
  ];
}
