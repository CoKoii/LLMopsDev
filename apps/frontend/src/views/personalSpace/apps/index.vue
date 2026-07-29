<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxAction, ListBoxItem } from '@/components/ListBox/types'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  createAiAppApi,
  deleteAiAppApi,
  listAiAppCategoriesApi,
  listAiAppsApi,
  updateAiAppApi,
  type AiAppCategoryItem,
  type AiAppItem,
  type CreateAiAppPayload,
} from '@/api'
import {
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  TextArea,
  type FormInstance,
} from 'antdv-next'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ImageUpload from '../components/ImageUpload.vue'

const props = defineProps<{
  searchValue?: string
  createKey?: number
  creatorAvatar?: string
}>()

const records = ref<AiAppItem[]>([])
const loading = ref(false)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref<number>()
const formRef = ref<FormInstance>()
const appCategories = ref<AiAppCategoryItem[]>([])
const categoriesLoading = ref(false)

const createEmptyForm = () => ({
  name: '',
  image: undefined as string | undefined,
  imageFileId: undefined as number | undefined,
  categoryId: undefined as number | undefined,
  description: '',
})

const formModel = reactive(createEmptyForm())
const modalTitle = computed(() => (editingId.value ? '编辑 AI 应用' : '创建 AI 应用'))
const router = useRouter()
const appActions: ListBoxAction[] = [
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除', danger: true },
]
const appCategoryOptions = computed(() =>
  appCategories.value.map((category) => ({
    label: category.name,
    value: category.id,
  })),
)

const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: formatAppDescription(item),
    content: item.description || '暂无描述',
    image: item.image || undefined,
    authorImage: props.creatorAvatar || undefined,
    footer: item.updatedAt ? `最近编辑 ${formatDate(item.updatedAt)}` : undefined,
    raw: item,
  })),
)

const formatAppDescription = (item: AiAppItem) => {
  const modelName = item.model?.modelName || '未选择模型'
  return `${item.category?.name || '未分类'} · ${modelName}`
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
  formRef.value?.clearValidate()
}

const loadList = async () => {
  loading.value = true
  try {
    const result = await listAiAppsApi({
      page: 1,
      pageSize: 100,
      name: props.searchValue,
    })
    records.value = result.items
  } finally {
    loading.value = false
  }
}

const loadAppCategories = async () => {
  if (appCategories.value.length) return

  categoriesLoading.value = true
  try {
    appCategories.value = await listAiAppCategoriesApi()
  } catch {
    message.error('应用分类获取失败')
  } finally {
    categoriesLoading.value = false
  }
}

const openCreate = async () => {
  editingId.value = undefined
  resetForm()
  modalOpen.value = true
  void loadAppCategories()
}

const openEdit = async (item: ListBoxItem) => {
  const record = item.raw as AiAppItem
  editingId.value = record.id
  Object.assign(formModel, {
    name: record.name,
    image: record.image || undefined,
    imageFileId: undefined,
    categoryId: record.category?.id,
    description: record.description || '',
  })
  formRef.value?.clearValidate()
  modalOpen.value = true
  void loadAppCategories()
}

const openOrchestration = (item: ListBoxItem) => {
  const record = item.raw as AiAppItem
  void router.push({ name: 'app-orchestration', params: { appId: record.id, page: 'edit' } })
}

const submit = async () => {
  await formRef.value?.validate()
  if (formModel.categoryId === undefined) return

  saving.value = true
  try {
    const payload: CreateAiAppPayload = {
      name: formModel.name,
      imageFileId: formModel.imageFileId,
      categoryId: formModel.categoryId,
      description: formModel.description,
    }

    if (editingId.value) {
      await updateAiAppApi(editingId.value, payload)
      message.success('AI应用已更新')
    } else {
      await createAiAppApi(payload)
      message.success('AI应用已创建')
    }

    modalOpen.value = false
    await loadList()
  } finally {
    saving.value = false
  }
}

const confirmDelete = (item: ListBoxItem) => {
  const record = item.raw as AiAppItem
  Modal.confirm({
    title: '要删除该应用吗？',
    content: '删除后，该 AI 应用将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await deleteAiAppApi(record.id)
      message.success('AI应用已删除')
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
      void openCreate()
    }
  },
)
</script>

<template>
  <ListBox
    :items="listItems"
    :loading="loading"
    :actions="appActions"
    @open="openOrchestration"
    @edit="openEdit"
    @delete="confirmDelete"
  />

  <AppModal
    v-model:open="modalOpen"
    :title="modalTitle"
    :confirm-loading="saving"
    ok-text="保存"
    cancel-text="取消"
    width="52rem"
    destroy-on-hidden
    @ok="submit"
  >
    <Form ref="formRef" class="resource-form" layout="vertical" :model="formModel">
      <FormItem
        label="应用图片"
        name="image"
        :rules="[{ required: true, message: '请上传应用图片' }]"
      >
        <ImageUpload v-model:url="formModel.image" v-model:file-id="formModel.imageFileId" />
      </FormItem>
      <FormItem
        label="应用名称"
        name="name"
        :rules="[{ required: true, message: '请输入应用名称' }]"
      >
        <Input v-model:value="formModel.name" placeholder="应用名称不能为空" :maxlength="100" />
      </FormItem>
      <FormItem
        label="应用分类"
        name="categoryId"
        :rules="[{ required: true, message: '请选择应用分类' }]"
      >
        <Select
          v-model:value="formModel.categoryId"
          :loading="categoriesLoading"
          :disabled="!categoriesLoading && appCategoryOptions.length === 0"
          :options="appCategoryOptions"
          placeholder="请选择应用分类"
        />
      </FormItem>
      <FormItem label="应用描述" name="description">
        <TextArea
          v-model:value="formModel.description"
          placeholder="请输入关于该应用的描述信息"
          :maxlength="800"
          :rows="4"
          show-count
        />
      </FormItem>
    </Form>
  </AppModal>
</template>

<style scoped lang="scss">
.resource-form {
  padding-top: 0.8rem;
}
</style>
