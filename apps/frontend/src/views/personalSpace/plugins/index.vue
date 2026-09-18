<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxAction, ListBoxItem } from '@/components/ListBox/types'
import AppModal from '@/components/AppModal/AppModal.vue'
import PluginDetailDrawer from '@/components/PluginDetailDrawer.vue'
import { parseOpenApiTools } from '@/utils/openapiTools'
import {
  createPluginApi,
  deletePluginApi,
  getPluginApi,
  listPluginCategoriesApi,
  listPluginsApi,
  updatePluginApi,
  type PluginHeader,
  type PluginCategoryItem,
  type PluginItem,
} from '@/api'
import {
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  TextArea,
  type FormInstance,
} from 'antdv-next'
import { Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import ImageUpload from '../components/ImageUpload.vue'

const props = defineProps<{
  searchValue?: string
  createKey?: number
  creatorAvatar?: string
  creatorName?: string
}>()

const records = ref<PluginItem[]>([])
const loading = ref(false)
const saving = ref(false)
const modalOpen = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailRecord = ref<PluginItem>()
const pluginCategories = ref<PluginCategoryItem[]>([])
const categoriesLoading = ref(false)
const editingId = ref<number>()
const formRef = ref<FormInstance>()

const createEmptyForm = () => ({
  icon: undefined as string | undefined,
  iconFileId: undefined as number | undefined,
  name: '',
  description: '',
  categoryId: undefined as number | undefined,
  openapiSchema: '',
  headers: [{ key: '', value: '' }] as PluginHeader[],
})

const formModel = reactive(createEmptyForm())
const modalTitle = computed(() => (editingId.value ? '编辑插件' : '新建插件'))
const parsedTools = computed(() => parseOpenApiTools(formModel.openapiSchema))
const pluginCategoryOptions = computed(() =>
  pluginCategories.value.map((category) => ({
    label: category.name,
    value: category.id,
  })),
)
const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: formatPluginDescription(item),
    content: item.description || item.openapiSchema,
    image: item.icon || undefined,
    authorImage: props.creatorAvatar || undefined,
    footer: item.updatedAt ? `最近编辑 ${formatDate(item.updatedAt)}` : undefined,
    raw: item,
  })),
)

const formatPluginDescription = (item: PluginItem) => {
  return `作者 ${props.creatorName || '用户'} · ${parseOpenApiTools(item.openapiSchema).length} 插件`
}

const pluginActions = (item: ListBoxItem): ListBoxAction[] => {
  const record = item.raw as PluginItem
  return [
    { key: 'edit', label: '编辑' },
    { key: 'togglePublish', label: record.published ? '取消发布' : '发布' },
    { key: 'delete', label: '删除', danger: true, disabled: record.published },
  ]
}

const formatDate = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const resetForm = () => {
  Object.assign(formModel, createEmptyForm())
  void nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const closeFormModal = () => {
  modalOpen.value = false
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

const loadPluginCategories = async () => {
  if (pluginCategories.value.length) return

  categoriesLoading.value = true
  try {
    pluginCategories.value = await listPluginCategoriesApi()
  } catch {
    message.error('插件分类获取失败')
  } finally {
    categoriesLoading.value = false
  }
}

const openCreate = () => {
  editingId.value = undefined
  resetForm()
  modalOpen.value = true
  void loadPluginCategories()
}

const openEditRecord = (record: PluginItem) => {
  detailOpen.value = false
  editingId.value = record.id
  Object.assign(formModel, {
    icon: record.icon || undefined,
    iconFileId: undefined,
    name: record.name,
    description: record.description || '',
    categoryId: record.category?.id,
    openapiSchema: record.openapiSchema,
    headers: record.headers?.length
      ? record.headers.map((header) => ({ ...header }))
      : [{ key: '', value: '' }],
  })
  void nextTick(() => {
    formRef.value?.clearValidate()
  })
  modalOpen.value = true
  void loadPluginCategories()
}

const openDetail = async (item: ListBoxItem) => {
  const record = item.raw as PluginItem
  detailRecord.value = record
  detailOpen.value = true
  detailLoading.value = true
  try {
    detailRecord.value = await getPluginApi(record.id)
  } catch {
    message.error('插件详情获取失败')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
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
      categoryId: formModel.categoryId,
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

    closeFormModal()
    await loadList()
  } finally {
    saving.value = false
  }
}

const confirmDelete = (item: ListBoxItem) => {
  const record = item.raw as PluginItem
  if (record.published) {
    message.warning('已发布插件不允许删除')
    return
  }
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

const refreshPublishedRecord = async (id: number) => {
  await loadList()
  if (detailOpen.value && detailRecord.value?.id === id) {
    try {
      detailRecord.value = await getPluginApi(id)
    } catch {
      detailOpen.value = false
    }
  }
}

const confirmTogglePublish = (item: ListBoxItem) => {
  const record = item.raw as PluginItem
  const nextPublished = !record.published

  Modal.confirm({
    title: nextPublished ? '要发布该插件吗？' : '要取消发布该插件吗？',
    content: nextPublished
      ? '发布后，插件会显示在已配置类别中，其他用户可以选择使用。'
      : '取消发布后，插件将从公开类别中移除，但仍保留在你的自定义插件中。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: nextPublished ? '发布' : '取消发布',
    cancelText: '取消',
    onOk: async () => {
      await updatePluginApi(record.id, { published: nextPublished })
      message.success(nextPublished ? '插件已发布' : '插件已取消发布')
      await refreshPublishedRecord(record.id)
    },
  })
}

const handleListAction = (key: string, item: ListBoxItem) => {
  if (key === 'edit') {
    openEditRecord(item.raw as PluginItem)
  } else if (key === 'delete') {
    confirmDelete(item)
  } else if (key === 'togglePublish') {
    confirmTogglePublish(item)
  }
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
  <ListBox
    :items="listItems"
    :loading="loading"
    :actions="pluginActions"
    @open="openDetail"
    @action="handleListAction"
  />

  <PluginDetailDrawer
    v-model:open="detailOpen"
    :plugin="detailRecord"
    :loading="detailLoading"
    show-edit
    @edit="openEditRecord"
  />

  <AppModal
    v-model:open="modalOpen"
    :title="modalTitle"
    :confirm-loading="saving"
    ok-text="保存"
    cancel-text="取消"
    width="78rem"
    destroy-on-hidden
    @ok="submit"
    @cancel="closeFormModal"
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
        label="插件分类"
        name="categoryId"
        :rules="[{ required: true, message: '请选择插件分类' }]"
      >
        <Select
          v-model:value="formModel.categoryId"
          :loading="categoriesLoading"
          :disabled="!categoriesLoading && pluginCategoryOptions.length === 0"
          :options="pluginCategoryOptions"
          placeholder="请选择插件分类"
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
