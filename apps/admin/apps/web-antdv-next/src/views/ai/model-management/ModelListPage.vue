<script lang="ts" setup>
import type { AiModelApi } from '#/api';

import { computed } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { Plus, RotateCw } from '@vben/icons';

import { Button, message, Modal, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteAiModelApi,
  getAiModelListApi,
  testAiModelApi,
  updateAiModelApi,
} from '#/api';

import {
  getUsageTypeText,
  testStatusMeta,
  useColumns,
  useGridFormSchema,
} from './data';
import Form from './modules/form.vue';

const props = defineProps<{
  usageType: AiModelApi.UsageType;
}>();

const systemUsageTypes = new Set<AiModelApi.UsageType>([
  'structured',
  'embedding',
  'multimodal',
  'rerank',
  'speech_to_text',
  'text_to_speech',
]);
const pageTitle = computed(() => getUsageTypeText(props.usageType));

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid<AiModelApi.ModelConfig>({
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: ({ page }: any, formValues: AiModelApi.QueryParams) =>
          getAiModelListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            usageType: props.usageType,
          }),
      },
    },
    rowConfig: {
      keyField: 'id',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      search: true,
      zoom: true,
    },
  },
});

function refresh() {
  gridApi.query();
}

function openCreate() {
  formModalApi.setData({ usageType: props.usageType }).open();
}

function openEdit(row: AiModelApi.ModelConfig) {
  formModalApi.setData(row).open();
}

async function testModel(row: AiModelApi.ModelConfig) {
  const hide = message.loading({
    content: `正在测试 ${row.modelName}`,
    duration: 0,
    key: 'model_test',
  });
  try {
    const result = await testAiModelApi(row.id);
    message.success({
      content: `${result.message}（${result.elapsedMs}ms）`,
      key: 'model_test',
    });
    refresh();
  } catch {
    hide();
  }
}

function enableModel(row: AiModelApi.ModelConfig) {
  if (row.enabled) return;

  Modal.confirm({
    content: systemUsageTypes.has(row.usageType)
      ? `确认启用 ${row.modelName} 吗？启用后同分类其他模型会自动停用。`
      : `确认启用 ${row.modelName} 吗？启用后可供用户选择。`,
    okText: '启用',
    onOk: async () => {
      await updateAiModelApi(row.id, { enabled: true });
      message.success('模型已启用');
      refresh();
    },
    title: '启用模型',
  });
}

function disableModel(row: AiModelApi.ModelConfig) {
  if (!row.enabled) return;

  Modal.confirm({
    content: systemUsageTypes.has(row.usageType)
      ? `确认停用 ${row.modelName} 吗？停用后后端没有可用的${getUsageTypeText(row.usageType)}模型。`
      : `确认停用 ${row.modelName} 吗？停用后用户不能选择该模型。`,
    okText: '停用',
    onOk: async () => {
      await updateAiModelApi(row.id, { enabled: false });
      message.success('模型已停用');
      refresh();
    },
    title: '停用模型',
  });
}

function removeModel(row: AiModelApi.ModelConfig) {
  Modal.confirm({
    content: `确认删除模型配置 ${row.modelName} 吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      await deleteAiModelApi(row.id);
      message.success('删除成功');
      refresh();
    },
    title: '删除模型配置',
  });
}
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refresh" />

    <Grid :table-title="pageTitle">
      <template #toolbar-tools>
        <Button type="primary" @click="openCreate">
          <Plus class="size-5" />
          添加{{ pageTitle }}模型
        </Button>
      </template>

      <template #apiKeyConfigured="{ row }">
        <Tag :color="row.apiKeyConfigured ? 'success' : 'warning'">
          {{ row.apiKeyConfigured ? '已配置' : '未配置' }}
        </Tag>
      </template>

      <template #enabled="{ row }">
        <Tag :color="row.enabled ? 'success' : 'default'">
          {{ row.enabled ? '启用' : '停用' }}
        </Tag>
      </template>

      <template #lastTestStatus="{ row }">
        <Tag :color="testStatusMeta[row.lastTestStatus]?.color">
          {{ testStatusMeta[row.lastTestStatus]?.text }}
        </Tag>
      </template>

      <template #action="{ row }">
        <div class="action-list">
          <Button class="action-button" type="link" @click="openEdit(row)">
            编辑
          </Button>
          <Button class="action-button" type="link" @click="testModel(row)">
            <RotateCw class="size-4" />
            测试
          </Button>
          <Button
            class="action-button"
            :disabled="row.enabled"
            type="link"
            @click="enableModel(row)"
          >
            启用
          </Button>
          <Button
            class="action-button"
            :disabled="!row.enabled"
            type="link"
            @click="disableModel(row)"
          >
            停用
          </Button>
          <Button
            class="action-button"
            danger
            type="link"
            @click="removeModel(row)"
          >
            删除
          </Button>
        </div>
      </template>
    </Grid>
  </Page>
</template>

<style scoped>
.action-list {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
}

</style>
