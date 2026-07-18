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

const props = defineProps<{
  searchValue?: string
  createKey?: number
}>()

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
const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: item.status ? '已启用' : '已停用',
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
    width="64rem"
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
</style>
