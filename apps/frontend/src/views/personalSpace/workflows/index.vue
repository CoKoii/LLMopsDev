<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxAction, ListBoxItem } from '@/components/ListBox/types'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  createWorkflowApi,
  deleteWorkflowApi,
  listWorkflowsApi,
  updateWorkflowApi,
  type WorkflowItem,
} from '@/api'
import { Form, FormItem, Input, message, Modal, TextArea, type FormInstance } from 'antdv-next'
import { computed, reactive, ref, watch } from 'vue'
import ImageUpload from '../components/ImageUpload.vue'

const props = defineProps<{
  searchValue?: string
  createKey?: number
  creatorAvatar?: string
}>()

const records = ref<WorkflowItem[]>([])
const loading = ref(false)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref<number>()
const formRef = ref<FormInstance>()

const createEmptyForm = () => ({
  icon: undefined as string | undefined,
  iconFileId: undefined as number | undefined,
  name: '',
  englishName: '',
  description: '',
})

const formModel = reactive(createEmptyForm())
const modalTitle = computed(() => (editingId.value ? '编辑工作流' : '创建工作流'))
const workflowActions: ListBoxAction[] = [
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除', danger: true },
]
const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: `${item.englishName} · ${item.status ? '已启用' : '已停用'}`,
    content: item.description || '暂无描述',
    image: item.icon || undefined,
    authorImage: props.creatorAvatar || undefined,
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
    const result = await listWorkflowsApi({
      page: 1,
      pageSize: 100,
      name: props.searchValue,
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
  const record = item.raw as WorkflowItem
  editingId.value = record.id
  Object.assign(formModel, {
    icon: record.icon || undefined,
    iconFileId: undefined,
    name: record.name,
    englishName: record.englishName,
    description: record.description || '',
  })
  formRef.value?.clearValidate()
  modalOpen.value = true
}

const submit = async () => {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = {
      iconFileId: formModel.iconFileId,
      name: formModel.name,
      englishName: formModel.englishName,
      description: formModel.description,
    }

    if (editingId.value) {
      await updateWorkflowApi(editingId.value, payload)
      message.success('工作流已更新')
    } else {
      await createWorkflowApi(payload)
      message.success('工作流已创建')
    }

    modalOpen.value = false
    await loadList()
  } finally {
    saving.value = false
  }
}

const confirmDelete = (item: ListBoxItem) => {
  const record = item.raw as WorkflowItem
  Modal.confirm({
    title: '要删除该工作流吗？',
    content: '删除后，该工作流将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await deleteWorkflowApi(record.id)
      message.success('工作流已删除')
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
  <ListBox
    :items="listItems"
    :loading="loading"
    :actions="workflowActions"
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
        label="工作流图标"
        name="icon"
        :rules="[{ required: true, message: '请上传工作流图标' }]"
      >
        <ImageUpload v-model:url="formModel.icon" v-model:file-id="formModel.iconFileId" />
      </FormItem>
      <FormItem
        label="工作流名称"
        name="name"
        :rules="[{ required: true, message: '请输入工作流名称' }]"
      >
        <Input v-model:value="formModel.name" placeholder="工作流名称不能为空" :maxlength="100" />
      </FormItem>
      <FormItem
        label="英文名称"
        name="englishName"
        :rules="[{ required: true, message: '请输入英文名称' }]"
      >
        <Input
          v-model:value="formModel.englishName"
          placeholder="英文名称将用于被大模型识别及调用"
          :maxlength="100"
        />
      </FormItem>
      <FormItem label="应用描述" name="description">
        <TextArea
          v-model:value="formModel.description"
          placeholder="请输入关于该工作流的描述信息"
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
