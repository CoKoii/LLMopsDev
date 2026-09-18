<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AdminApi } from '#/api';

import { Page, useVbenModal } from '@vben/common-ui';

import { Button, message, Modal, Space, Switch, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getAdminUserListApi, updateAdminUserApi } from '#/api';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid<AdminApi.User>({
  formOptions: { schema: useGridFormSchema(), submitOnChange: true },
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues: { nickname?: string }) =>
          getAdminUserListApi({
            nickname: formValues.nickname,
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
  } as VxeTableGridOptions<AdminApi.User>,
});

function refresh() {
  gridApi.query();
}

function editUser(row: AdminApi.User) {
  formModalApi.setData(row).open();
}

function toggleStatus(row: AdminApi.User, enabled: boolean) {
  const status: AdminApi.UserStatus = enabled ? 'active' : 'disabled';
  Modal.confirm({
    title: enabled ? '启用用户' : '停用用户',
    content: `确认${enabled ? '启用' : '停用'}用户 ${row.username} 吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await updateAdminUserApi(row.id, { status });
      message.success(enabled ? '用户已启用' : '用户已停用');
      refresh();
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refresh" />
    <Grid table-title="用户管理">
      <template #roles="{ row }">
        <span>{{
          row.roles?.map((role: AdminApi.Role) => role.roleName).join('、') ||
          '未分配角色'
        }}</span>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status === 'active' ? 'success' : 'default'">
          {{
            row.status === 'active'
              ? '正常'
              : row.status === 'locked'
                ? '锁定'
                : '停用'
          }}
        </Tag>
      </template>
      <template #action="{ row }">
        <Space>
          <Switch
            size="small"
            :checked="row.status === 'active'"
            @change="(checked: unknown) => toggleStatus(row, checked === true)"
          />
          <Button type="link" size="small" @click="editUser(row)">编辑</Button>
        </Space>
      </template>
    </Grid>
  </Page>
</template>
