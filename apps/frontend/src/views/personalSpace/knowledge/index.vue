<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxItem } from '@/components/ListBox/types'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  createKnowledgeApi,
  deleteKnowledgeApi,
  listKnowledgeApi,
  updateKnowledgeApi,
  type KnowledgeItem,
} from '@/api'
import { Form, FormItem, Input, message, Modal, TextArea, type FormInstance } from 'antdv-next'
import { computed, reactive, ref, watch } from 'vue'
import ImageUpload from '../components/ImageUpload.vue'

const props = defineProps<{
  searchValue?: string
  createKey?: number
}>()

const records = ref<KnowledgeItem[]>([])
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
})

const formModel = reactive(createEmptyForm())
const modalTitle = computed(() => (editingId.value ? '编辑知识库' : '创建知识库'))
const listItems = computed<ListBoxItem[]>(() =>
  records.value.map((item) => ({
    id: item.id,
    title: item.name,
    description: `知识库 · ${item.status ? '已启用' : '已停用'}`,
    content: item.description || '暂无描述',
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
    const result = await listKnowledgeApi({
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
  const record = item.raw as KnowledgeItem
  editingId.value = record.id
  Object.assign(formModel, {
    icon: record.icon || undefined,
    iconFileId: undefined,
    name: record.name,
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
      description: formModel.description,
    }

    if (editingId.value) {
      await updateKnowledgeApi(editingId.value, payload)
      message.success('知识库已更新')
    } else {
      await createKnowledgeApi(payload)
      message.success('知识库已创建')
    }

    modalOpen.value = false
    await loadList()
  } finally {
    saving.value = false
  }
}

const confirmDelete = (item: ListBoxItem) => {
  const record = item.raw as KnowledgeItem
  Modal.confirm({
    title: '要删除该知识库吗？',
    content: '删除后，该知识库将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await deleteKnowledgeApi(record.id)
      message.success('知识库已删除')
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
    width="52rem"
    @ok="submit"
  >
    <Form ref="formRef" class="resource-form" layout="vertical" :model="formModel">
      <FormItem
        label="知识库图标"
        name="icon"
        :rules="[{ required: true, message: '请上传知识库图标' }]"
      >
        <ImageUpload v-model:url="formModel.icon" v-model:file-id="formModel.iconFileId" />
      </FormItem>
      <FormItem
        label="知识库名称"
        name="name"
        :rules="[{ required: true, message: '请输入知识库名称' }]"
      >
        <Input v-model:value="formModel.name" placeholder="知识库名称不能为空" :maxlength="100" />
      </FormItem>
      <FormItem label="知识库描述" name="description">
        <TextArea
          v-model:value="formModel.description"
          placeholder="输入知识库内容的描述"
          :maxlength="2000"
          :rows="5"
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
