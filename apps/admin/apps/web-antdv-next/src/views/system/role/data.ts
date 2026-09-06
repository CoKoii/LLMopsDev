import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '角色名称关键词' },
      fieldName: 'roleName',
      label: '角色名称',
    },
  ];
}

export function useColumns(): VxeTableGridColumns {
  return [
    { field: 'id', title: 'ID', width: 80 },
    { field: 'roleName', minWidth: 180, title: '角色名称' },
    { field: 'description', minWidth: 220, title: '描述' },
    {
      field: 'permissions',
      minWidth: 280,
      slots: { default: 'permissions' },
      title: '权限',
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 110,
    },
    {
      field: 'updatedAt',
      formatter: 'formatDateTime',
      title: '更新时间',
      width: 180,
    },
    {
      field: 'action',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 150,
    },
  ];
}
