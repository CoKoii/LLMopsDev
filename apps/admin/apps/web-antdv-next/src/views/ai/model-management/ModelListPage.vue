<script lang="ts" setup>
import type { AiModelApi } from '#/api';

import { Page, useVbenModal } from '@vben/common-ui';
import { ChevronDown, Plus, RotateCw } from '@vben/icons';

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
  usageTypeOptions,
  useColumns,
  useGridFormSchema,
} from './data';
import Form from './modules/form.vue';

type UsageGroupRow = {
  id: string;
  kind: 'group';
  modelCount: number;
  modelName: string;
  usageType: AiModelApi.UsageType;
};

type ModelRow = AiModelApi.ModelConfig & {
  id: string;
  kind: 'model';
  modelId: number;
  parentId: string;
};

type ModelTableRow = ModelRow | UsageGroupRow;

const systemUsageTypes = new Set<AiModelApi.UsageType>([
  'structured',
  'built_in_large',
  'embedding',
  'multimodal',
  'rerank',
  'speech_to_text',
  'text_to_speech',
]);

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

async function getAllModels(query: AiModelApi.QueryParams) {
  const firstPage = await getAiModelListApi({
    ...query,
    page: 1,
    pageSize: 200,
  });
  if (firstPage.pages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) =>
      getAiModelListApi({
        ...query,
        page: index + 2,
        pageSize: firstPage.pageSize,
      }),
    ),
  );
  return [
    ...firstPage.items,
    ...remainingPages.flatMap((page) => page.items),
  ];
}

const [Grid, gridApi] = useVbenVxeGrid<ModelTableRow>({
  formOptions: {
    schema: useGridFormSchema(),
  },
  showSearchForm: false,
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    pagerConfig: {
      enabled: false,
    },
    proxyConfig: {
      ajax: {
        query: async (_params: unknown, formValues: AiModelApi.QueryParams) => {
          const models = await getAllModels(formValues);
          const modelsByUsage = new Map<
            AiModelApi.UsageType,
            AiModelApi.ModelConfig[]
          >();
          for (const model of models) {
            const usageModels = modelsByUsage.get(model.usageType) ?? [];
            usageModels.push(model);
            modelsByUsage.set(model.usageType, usageModels);
          }

          return usageTypeOptions.flatMap((option) => {
            const usageType = option.value as AiModelApi.UsageType;
            const groupId = `usage:${usageType}`;
            const models = modelsByUsage.get(usageType) ?? [];
            return [
              {
                id: groupId,
                kind: 'group' as const,
                modelCount: models.length,
                modelName: option.label,
                usageType,
              },
              ...models.map((model) => ({
                ...model,
                id: `model:${model.id}`,
                kind: 'model' as const,
                modelId: model.id,
                parentId: groupId,
              })),
            ];
          });
        },
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
    treeConfig: {
      parentField: 'parentId',
      rowField: 'id',
      transform: true,
    },
  },
});

function isModelRow(row: ModelTableRow): row is ModelRow {
  return row.kind === 'model';
}

function refresh() {
  gridApi.query();
}

function expandAll() {
  gridApi.grid?.setAllTreeExpand(true);
}

function collapseAll() {
  gridApi.grid?.setAllTreeExpand(false);
}

function openCreate(usageType: AiModelApi.UsageType) {
  formModalApi.setData({ usageType }).open();
}

function openEdit(row: ModelRow) {
  formModalApi.setData({ ...row, id: row.modelId }).open();
}

async function testModel(row: ModelRow) {
  const hide = message.loading({
    content: `正在测试 ${row.modelName}`,
    duration: 0,
    key: 'model_test',
  });
  try {
    const result = await testAiModelApi(row.modelId);
    message.success({
      content: `${result.message}（${result.elapsedMs}ms）`,
      key: 'model_test',
    });
    refresh();
  } catch {
    hide();
  }
}

function enableModel(row: ModelRow) {
  if (row.enabled) return;

  Modal.confirm({
    content: systemUsageTypes.has(row.usageType)
      ? `确认启用 ${row.modelName} 吗？启用后同分类其他模型会自动停用。`
      : `确认启用 ${row.modelName} 吗？启用后可供用户选择。`,
    okText: '启用',
    onOk: async () => {
      await updateAiModelApi(row.modelId, { enabled: true });
      message.success('模型已启用');
      refresh();
    },
    title: '启用模型',
  });
}

function disableModel(row: ModelRow) {
  if (!row.enabled) return;

  Modal.confirm({
    content: systemUsageTypes.has(row.usageType)
      ? `确认停用 ${row.modelName} 吗？停用后后端没有可用的${getUsageTypeText(row.usageType)}。`
      : `确认停用 ${row.modelName} 吗？停用后用户不能选择该模型。`,
    okText: '停用',
    onOk: async () => {
      await updateAiModelApi(row.modelId, { enabled: false });
      message.success('模型已停用');
      refresh();
    },
    title: '停用模型',
  });
}

function removeModel(row: ModelRow) {
  Modal.confirm({
    content: `确认删除模型配置 ${row.modelName} 吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      await deleteAiModelApi(row.modelId);
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

    <Grid table-title="模型管理">
      <template #toolbar-tools>
        <Button @click="expandAll">
          <ChevronDown class="size-4" />
          展开全部
        </Button>
        <Button @click="collapseAll">
          <ChevronDown class="size-4 rotate-180" />
          折叠全部
        </Button>
      </template>

      <template #modelName="{ row }: { row: ModelTableRow }">
        <div v-if="row.kind === 'group'" class="usage-group">
          <strong>{{ row.modelName }}</strong>
          <Tag>{{ row.modelCount }} 个配置</Tag>
        </div>
        <span v-else>{{ row.modelName }}</span>
      </template>

      <template #usageType="{ row }: { row: ModelTableRow }">
        <span v-if="isModelRow(row)">{{ getUsageTypeText(row.usageType) }}</span>
      </template>

      <template #enabled="{ row }: { row: ModelTableRow }">
        <Tag v-if="isModelRow(row)" :color="row.enabled ? 'success' : 'default'">
          {{ row.enabled ? '启用' : '停用' }}
        </Tag>
      </template>

      <template #lastTestStatus="{ row }: { row: ModelTableRow }">
        <Tag
          v-if="isModelRow(row)"
          :color="testStatusMeta[row.lastTestStatus]?.color"
        >
          {{ testStatusMeta[row.lastTestStatus]?.text }}
        </Tag>
      </template>

      <template #action="{ row }: { row: ModelTableRow }">
        <Button
          v-if="row.kind === 'group'"
          class="action-button"
          type="link"
          @click="openCreate(row.usageType)"
        >
          <Plus class="size-4" />
          新增配置
        </Button>
        <div v-else class="action-list">
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
.usage-group,
.action-list,
.action-button {
  display: flex;
  align-items: center;
}

.usage-group {
  gap: 8px;
}

.action-list {
  justify-content: center;
  gap: 4px;
}

.action-button {
  gap: 4px;
  padding: 0 2px;
}
</style>
