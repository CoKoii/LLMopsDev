<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AdminApi } from '#/api';

import { Page, useVbenModal } from '@vben/common-ui';
import { Button, message, Modal, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getAdminPermissionListApi, updateAdminPermissionApi } from '#/api';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid<AdminApi.Permission>({
  formOptions: { schema: useGridFormSchema(), submitOnChange: true },
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues: { code?: string }) =>
          getAdminPermissionListApi({
            code: formValues.code,
            page: page.currentPage,
            pageSize: page.pageSize,
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
  } as VxeTableGridOptions<AdminApi.Permission>,
});

function refresh() {
  gridApi.query();
}

function openCreate() {
  formModalApi.setData(undefined).open();
}

function openEdit(row: AdminApi.Permission) {
  formModalApi.setData(row).open();
}

function toggleStatus(row: AdminApi.Permission, status: boolean) {
  Modal.confirm({
    title: status ? '启用权限' : '停用权限',
    content: `确认${status ? '启用' : '停用'}权限 ${row.code} 吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await updateAdminPermissionApi(row.id, { status });
      message.success(status ? '权限已启用' : '权限已停用');
      refresh();
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refresh" />
    <Grid table-title="权限管理">
      <template #toolbar-tools>
        <Button type="primary" @click="openCreate">新建权限</Button>
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
