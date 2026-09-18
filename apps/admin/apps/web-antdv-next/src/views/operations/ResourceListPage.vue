<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AdminOpsApi } from '#/api';

import { computed } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, message, Modal, Space, Switch, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getAdminAppListApi,
  getAdminKnowledgeListApi,
  getAdminPluginListApi,
  updateAdminAppApi,
  updateAdminKnowledgeApi,
  updateAdminPluginApi,
} from '#/api';

type ResourceKind = 'agent' | 'knowledge' | 'plugin';

const props = defineProps<{ kind: ResourceKind }>();
const isKnowledge = computed(() => props.kind === 'knowledge');
const title = computed(() =>
  props.kind === 'agent'
    ? '智能体管理'
    : props.kind === 'plugin'
      ? '插件管理'
      : '知识库管理',
);

const formSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    componentProps: { allowClear: true, placeholder: '名称关键词' },
    fieldName: 'name',
    label: '名称',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: [
        { label: '启用', value: true },
        { label: '停用', value: false },
      ],
      placeholder: '全部状态',
    },
    fieldName: 'status',
    label: '状态',
  },
  ...(!isKnowledge.value
    ? [
        {
          component: 'Select',
          componentProps: {
            allowClear: true,
            options: [
              { label: '已发布', value: true },
              { label: '未发布', value: false },
            ],
            placeholder: '全部发布状态',
          },
          fieldName: 'published',
          label: '发布状态',
        } as VbenFormSchema,
      ]
    : []),
];

const columns = computed(() => [
  { field: 'id', title: 'ID', width: 80 },
  { field: 'name', minWidth: 190, title: '名称' },
  { field: 'categoryName', minWidth: 130, title: '分类' },
  { field: 'ownerUsername', minWidth: 140, title: '创建人' },
  ...(isKnowledge.value
    ? [
        { field: 'documentCount', title: '文档', width: 90 },
        { field: 'chunkCount', title: '片段', width: 90 },
        {
          field: 'failedDocumentCount',
          slots: { default: 'failedDocuments' },
          title: '异常文档',
          width: 110,
        },
      ]
    : [
        {
          field: 'status',
          slots: { default: 'status' },
          title: '状态',
          width: 100,
        },
        {
          field: 'published',
          slots: { default: 'published' },
          title: '发布',
          width: 100,
        },
      ]),
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
    width: isKnowledge.value ? 110 : 210,
  },
]);

const [Grid, gridApi] = useVbenVxeGrid<
  AdminOpsApi.ResourceItem | AdminOpsApi.KnowledgeItem
>({
  formOptions: { schema: formSchema, submitOnChange: true },
  gridOptions: {
    columns: columns.value,
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues: AdminOpsApi.ResourceQuery) => {
          const params = {
            ...formValues,
            page: page.currentPage,
            pageSize: page.pageSize,
          };
          if (props.kind === 'agent') return getAdminAppListApi(params);
          if (props.kind === 'plugin') return getAdminPluginListApi(params);
          return getAdminKnowledgeListApi(params);
        },
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
  } as VxeTableGridOptions<
    AdminOpsApi.ResourceItem | AdminOpsApi.KnowledgeItem
  >,
});

const refresh = () => gridApi.query();

function getFailedDocumentCount(
  row: AdminOpsApi.ResourceItem | AdminOpsApi.KnowledgeItem,
) {
  return 'failedDocumentCount' in row ? row.failedDocumentCount : 0;
}

function updateStatus(
  row: AdminOpsApi.ResourceItem | AdminOpsApi.KnowledgeItem,
  status: boolean,
) {
  Modal.confirm({
    title: status ? '启用资源' : '停用资源',
    content: `确认${status ? '启用' : '停用'}「${row.name}」吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      if (props.kind === 'agent') await updateAdminAppApi(row.id, { status });
      else if (props.kind === 'plugin')
        await updateAdminPluginApi(row.id, { status });
      else await updateAdminKnowledgeApi(row.id, { status });
      message.success(status ? '资源已启用' : '资源已停用');
      refresh();
    },
  });
}

function updatePublished(row: AdminOpsApi.ResourceItem, published: boolean) {
  Modal.confirm({
    title: published ? '发布资源' : '取消发布',
    content: `确认${published ? '发布' : '取消发布'}「${row.name}」吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      if (props.kind === 'agent')
        await updateAdminAppApi(row.id, { published });
      else await updateAdminPluginApi(row.id, { published });
      message.success(published ? '资源已发布' : '资源已取消发布');
      refresh();
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="title">
      <template #status="{ row }">
        <Tag :color="row.status ? 'success' : 'default'">{{
          row.status ? '启用' : '停用'
        }}</Tag>
      </template>
      <template #published="{ row }">
        <Tag :color="row.published ? 'blue' : 'default'">{{
          row.published ? '已发布' : '未发布'
        }}</Tag>
      </template>
      <template #failedDocuments="{ row }">
        <Tag :color="getFailedDocumentCount(row) ? 'error' : 'success'">
          {{ getFailedDocumentCount(row) }}
        </Tag>
      </template>
      <template #action="{ row }">
        <Space>
          <Switch
            size="small"
            :checked="row.status"
            @change="(checked: unknown) => updateStatus(row, checked === true)"
          />
          <Button
            v-if="!isKnowledge"
            type="link"
            size="small"
            @click="updatePublished(row, !row.published)"
          >
            {{ row.published ? '取消发布' : '发布' }}
          </Button>
        </Space>
      </template>
    </Grid>
  </Page>
</template>
