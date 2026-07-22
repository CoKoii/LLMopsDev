<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxItem } from '@/components/ListBox/types'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  createPluginApi,
  deletePluginApi,
  listPluginsApi,
  updatePluginApi,
  type PluginHeader,
  type PluginItem,
} from '@/api'
import {
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  TextArea,
  type FormInstance,
} from 'antdv-next'
import { Plus, Trash2 } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import ImageUpload from '../components/ImageUpload.vue'

type ParsedTool = {
  name: string
  description: string
  method: string
  path: string
}

const props = defineProps<{
  searchValue?: string
  createKey?: number
}>()

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
const records = ref<PluginItem[]>([])
const loading = ref(false)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref<number>()
const formRef = ref<FormInstance>()

const createEmptyForm = () => ({
  icon: undefined as string | undefined,
  iconFileId: undefined as number | undefined,
  name: '',
  description: '',
  openapiSchema: '',
  headers: [{ key: '', value: '' }] as PluginHeader[],
})

const formModel = reactive(createEmptyForm())
const modalTitle = computed(() => (editingId.value ? '编辑插件' : '新建插件'))
const parsedTools = computed<ParsedTool[]>(() => parseOpenApiTools(formModel.openapiSchema))
const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: item.published ? '已发布' : '未发布',
    content: item.description || item.openapiSchema,
    image: item.icon || undefined,
    footer: item.updatedAt ? `最近编辑 ${formatDate(item.updatedAt)}` : undefined,
    raw: item,
  })),
)

const formatDate = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseOpenApiTools = (source: string): ParsedTool[] => {
  if (!source.trim()) return []

  try {
    const document: unknown = JSON.parse(source)
    if (!isRecord(document) || !isRecord(document.paths)) return []

    const tools: ParsedTool[] = []
    for (const [path, pathConfig] of Object.entries(document.paths)) {
      if (!isRecord(pathConfig)) continue

      for (const [method, operation] of Object.entries(pathConfig)) {
        const normalizedMethod = method.toLowerCase()
        if (!httpMethods.has(normalizedMethod) || !isRecord(operation)) continue

        const operationId =
          typeof operation.operationId === 'string' && operation.operationId.trim()
            ? operation.operationId.trim()
            : `${normalizedMethod.toUpperCase()} ${path}`
        const description =
          typeof operation.summary === 'string' && operation.summary.trim()
            ? operation.summary.trim()
            : typeof operation.description === 'string' && operation.description.trim()
              ? operation.description.trim()
              : '-'

        tools.push({
          name: operationId,
          description,
          method: normalizedMethod,
          path,
        })
      }
    }

    return tools
  } catch {
    return []
  }
}

const resetForm = () => {
  Object.assign(formModel, createEmptyForm())
  formRef.value?.clearValidate()
}

const loadList = async () => {
  loading.value = true
  try {
    const result = await listPluginsApi({
      page: 1,
      pageSize: 100,
      name: props.searchValue,
      scope: 'mine',
    })
    records.value = result.items
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = undefined
  resetForm()
  modalOpen.value = true
}

const openEdit = (item: ListBoxItem) => {
  const record = item.raw as PluginItem
  editingId.value = record.id
  Object.assign(formModel, {
    icon: record.icon || undefined,
    iconFileId: undefined,
    name: record.name,
    description: record.description || '',
    openapiSchema: record.openapiSchema,
    headers: record.headers?.length
      ? record.headers.map((header) => ({ ...header }))
      : [{ key: '', value: '' }],
  })
  formRef.value?.clearValidate()
  modalOpen.value = true
}

const addHeader = () => {
  formModel.headers.push({ key: '', value: '' })
}

const removeHeader = (index: number) => {
  formModel.headers.splice(index, 1)
  if (!formModel.headers.length) {
    addHeader()
  }
}

const normalizeHeaders = () => {
  return formModel.headers
    .map((header) => ({
      key: header.key.trim(),
      value: header.value.trim(),
    }))
    .filter((header) => header.key || header.value)
}

const submit = async () => {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = {
      iconFileId: formModel.iconFileId,
      name: formModel.name,
      description: formModel.description,
      openapiSchema: formModel.openapiSchema,
      headers: normalizeHeaders(),
    }

    if (editingId.value) {
      await updatePluginApi(editingId.value, payload)
      message.success('插件已更新')
    } else {
      await createPluginApi(payload)
      message.success('插件已创建')
    }

    modalOpen.value = false
    await loadList()
  } finally {
    saving.value = false
  }
}

const confirmDelete = (item: ListBoxItem) => {
  const record = item.raw as PluginItem
  Modal.confirm({
    title: '要删除该插件吗？',
    content: '删除后，该插件将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await deletePluginApi(record.id)
      message.success('插件已删除')
      await loadList()
    },
  })
}

watch(
  () => props.searchValue,
  () => {
    void loadList()
  },
  { immediate: true },
)

watch(
  () => props.createKey,
  (value, oldValue) => {
    if (value !== oldValue) {
      openCreate()
    }
  },
)
</script>

<template>
  <ListBox :items="listItems" :loading="loading" @edit="openEdit" @delete="confirmDelete" />

  <AppModal
    v-model:open="modalOpen"
    :title="modalTitle"
    :confirm-loading="saving"
    ok-text="保存"
    cancel-text="取消"
    width="78rem"
    @ok="submit"
  >
    <Form ref="formRef" class="resource-form" layout="vertical" :model="formModel">
      <FormItem
        label="插件图标"
        name="icon"
        :rules="[{ required: true, message: '请上传插件图标' }]"
      >
        <ImageUpload v-model:url="formModel.icon" v-model:file-id="formModel.iconFileId" />
      </FormItem>
      <FormItem
        label="插件名称"
        name="name"
        :rules="[{ required: true, message: '请输入插件名称' }]"
      >
        <Input v-model:value="formModel.name" placeholder="请输入插件名称" :maxlength="100" />
      </FormItem>
      <FormItem label="插件描述" name="description">
        <TextArea
          v-model:value="formModel.description"
          placeholder="请输入插件描述"
          :maxlength="800"
          :rows="3"
          show-count
        />
      </FormItem>
      <FormItem
        label="OpenAPI Schema"
        name="openapiSchema"
        :rules="[{ required: true, message: '请输入 OpenAPI Schema' }]"
      >
        <TextArea
          v-model:value="formModel.openapiSchema"
          placeholder="在此处输入您的 OpenAPI Schema"
          :rows="6"
        />
      </FormItem>
      <FormItem label="可用工具">
        <div class="available-tools">
          <div class="available-tools__head">
            <span>名称</span>
            <span>描述</span>
            <span>方法</span>
            <span>路径</span>
          </div>
          <div v-if="parsedTools.length === 0" class="available-tools__empty">
            输入 OpenAPI Schema 后自动解析可用工具
          </div>
          <div
            v-for="tool in parsedTools"
            v-else
            :key="`${tool.method}-${tool.path}-${tool.name}`"
            class="available-tools__row"
          >
            <span>{{ tool.name }}</span>
            <span>{{ tool.description }}</span>
            <span>{{ tool.method }}</span>
            <span>{{ tool.path }}</span>
          </div>
        </div>
      </FormItem>
      <FormItem label="Headers">
        <div class="headers">
          <div class="header-row" v-for="(header, index) in formModel.headers" :key="index">
            <Input v-model:value="header.key" placeholder="Key" />
            <Input v-model:value="header.value" placeholder="Value" />
            <Button class="icon-btn" type="text" danger @click="removeHeader(index)">
              <template #icon>
                <Trash2 class="btn-icon" />
              </template>
            </Button>
          </div>
          <Button class="add-header" @click="addHeader">
            <template #icon>
              <Plus class="btn-icon" />
            </template>
            新增参数
          </Button>
        </div>
      </FormItem>
    </Form>
  </AppModal>
</template>

<style scoped lang="scss">
.resource-form {
  padding-top: 0.8rem;
}

.headers {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.header-row {
  display: grid;
  grid-template-columns: 1fr 1fr 3.2rem;
  gap: 0.8rem;
  align-items: center;
}

.icon-btn {
  width: 3.2rem;
  height: 3.2rem;
  padding: 0;
}

.btn-icon {
  width: 1.4rem;
  height: 1.4rem;
}

.add-header {
  align-self: flex-start;
}

.available-tools {
  overflow: hidden;
  border: 0.1rem solid #e5e7eb;
  border-radius: 0.4rem;
  color: #5f6775;
  font-size: 1.2rem;
}

.available-tools__head,
.available-tools__row {
  display: grid;
  grid-template-columns: minmax(12rem, 1.4fr) minmax(14rem, 1.7fr) 5.6rem minmax(24rem, 2.3fr);
  align-items: center;
  min-height: 3.4rem;
  padding: 0.7rem 1.2rem;
  column-gap: 1.2rem;
}

.available-tools__head {
  background: #fafafa;
  color: #303846;
  font-weight: 500;
}

.available-tools__row {
  border-top: 0.1rem solid #eef0f3;
}

.available-tools__row span,
.available-tools__head span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.available-tools__row span:last-child {
  overflow: visible;
  text-overflow: initial;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.available-tools__empty {
  padding: 1.2rem;
  border-top: 0.1rem solid #eef0f3;
  color: #9aa1ad;
}
</style>
