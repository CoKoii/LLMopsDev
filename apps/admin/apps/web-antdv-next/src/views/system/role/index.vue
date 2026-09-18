<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AdminApi } from '#/api';

import { Page, useVbenModal } from '@vben/common-ui';
import { Button, message, Modal, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getAdminRoleListApi, updateAdminRoleApi } from '#/api';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid<AdminApi.Role>({
  formOptions: { schema: useGridFormSchema(), submitOnChange: true },
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues: { roleName?: string }) =>
          getAdminRoleListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
            roleName: formValues.roleName,
          }),
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<AdminApi.Role>,
});

function refresh() {
  gridApi.query();
}

function openCreate() {
  formModalApi.setData(undefined).open();
}

function openEdit(row: AdminApi.Role) {
  formModalApi.setData(row).open();
}

function toggleStatus(row: AdminApi.Role, status: boolean) {
  Modal.confirm({
    title: status ? '启用角色' : '停用角色',
    content: `确认${status ? '启用' : '停用'}角色 ${row.roleName} 吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await updateAdminRoleApi(row.id, { status });
      message.success(status ? '角色已启用' : '角色已停用');
      refresh();
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refresh" />
    <Grid table-title="角色管理">
      <template #toolbar-tools>
        <Button type="primary" @click="openCreate">新建角色</Button>
      </template>
      <template #permissions="{ row }">
        <span>{{
          row.permissions
            ?.map((item: AdminApi.Permission) => item.code)
            .join('、') || '未分配权限'
        }}</span>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status ? 'success' : 'default'">{{
          row.status ? '启用' : '停用'
        }}</Tag>
      </template>
      <template #action="{ row }">
        <Button type="link" size="small" @click="openEdit(row)">编辑</Button>
        <Button
          type="link"
          size="small"
          @click="toggleStatus(row, !row.status)"
        >
          {{ row.status ? '停用' : '启用' }}
        </Button>
      </template>
    </Grid>
  </Page>
</template>
