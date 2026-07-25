<script setup lang="ts">
import {
  createKnowledgeDocumentChunkApi,
  deleteKnowledgeDocumentChunkApi,
  getKnowledgeDocumentApi,
  listKnowledgeDocumentChunksApi,
  updateKnowledgeDocumentChunkApi,
  type KnowledgeDocumentChunkItem,
  type KnowledgeDocumentItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import { BookOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@antdv-next/icons'
import { Button, Input, message, Modal, Select, Switch, Tag, TextArea } from 'antdv-next'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const documentDetail = ref<KnowledgeDocumentItem>()
const chunks = ref<KnowledgeDocumentChunkItem[]>([])
const loading = ref(false)
const saving = ref(false)
const searchValue = ref('')
const modalOpen = ref(false)
const editingChunk = ref<KnowledgeDocumentChunkItem>()

const formModel = reactive({
  text: '',
  keywords: [] as string[],
})

const parseRouteNumber = (value: unknown) => Number(Array.isArray(value) ? value[0] : value)

const knowledgeId = computed(() => parseRouteNumber(route.params.knowledgeId))
const documentId = computed(() => parseRouteNumber(route.params.documentId))
const modalTitle = computed(() => (editingChunk.value ? '修改片段' : '添加片段'))

const formatDateTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const formatNumber = (value: number) => value.toLocaleString('en-US')

const getChunkKeywords = (chunk: KnowledgeDocumentChunkItem) => {
  const keywords = chunk.metadata?.keywords
  return Array.isArray(keywords)
    ? keywords.filter((item): item is string => typeof item === 'string')
    : []
}

const resetForm = () => {
  formModel.text = ''
  formModel.keywords = []
}

const loadChunks = async () => {
  if (!Number.isFinite(knowledgeId.value) || !Number.isFinite(documentId.value)) return

  loading.value = true
  try {
    const [documentResult, chunkResult] = await Promise.all([
      getKnowledgeDocumentApi(knowledgeId.value, documentId.value),
      listKnowledgeDocumentChunksApi(knowledgeId.value, documentId.value, {
        page: 1,
        pageSize: 200,
        keyword: searchValue.value.trim() || undefined,
      }),
    ])
    documentDetail.value = documentResult
    chunks.value = chunkResult.items
  } finally {
    loading.value = false
  }
}

const openCreateModal = () => {
  editingChunk.value = undefined
  resetForm()
  modalOpen.value = true
}

const openEditModal = (chunk: KnowledgeDocumentChunkItem) => {
  editingChunk.value = chunk
  formModel.text = chunk.text
  formModel.keywords = getChunkKeywords(chunk)
  modalOpen.value = true
}

const submitChunk = async () => {
  const text = formModel.text.trim()
  if (!text) {
    message.warning('请输入片段内容')
    return
  }

  saving.value = true
  try {
    const payload = {
      text,
      keywords: formModel.keywords
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10),
    }
    if (editingChunk.value) {
      await updateKnowledgeDocumentChunkApi(
        knowledgeId.value,
        documentId.value,
        editingChunk.value.id,
        payload,
      )
      message.success('片段已更新')
    } else {
      await createKnowledgeDocumentChunkApi(knowledgeId.value, documentId.value, payload)
      message.success('片段已添加')
    }

    modalOpen.value = false
    await loadChunks()
  } finally {
    saving.value = false
  }
}

const toggleChunk = async (chunk: KnowledgeDocumentChunkItem, checked: boolean) => {
  const previousEnabled = chunk.enabled
  chunk.enabled = checked
  try {
    await updateKnowledgeDocumentChunkApi(knowledgeId.value, documentId.value, chunk.id, {
      enabled: checked,
    })
    message.success(checked ? '片段已启用' : '片段已禁用')
  } catch {
    chunk.enabled = previousEnabled
  }
}

const confirmDeleteChunk = (chunk: KnowledgeDocumentChunkItem) => {
  Modal.confirm({
    title: '要删除该文档片段吗？',
    content: '删除片段后，知识库将无法再检索到该片段。如需暂时关闭检索，可以选择禁用。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      await deleteKnowledgeDocumentChunkApi(knowledgeId.value, documentId.value, chunk.id)
      message.success('片段已删除')
      await loadChunks()
    },
  })
}

watch(
  () => [route.params.knowledgeId, route.params.documentId],
  () => {
    void loadChunks()
  },
  { immediate: true },
)

watch(searchValue, () => {
  void loadChunks()
})
</script>

<template>
  <div class="knowledge-chunks-page">
    <header class="knowledge-chunks-header">
      <div class="knowledge-chunks-title">
        <div class="knowledge-chunks-title__icon">
          <BookOutlined />
        </div>
        <div class="knowledge-chunks-title__content">
          <h1>{{ documentDetail?.name || '文档片段' }}</h1>
          <p>
            <Tag>{{ formatNumber(documentDetail?.chunkCount || chunks.length) }} 文档片段</Tag>
            <Tag>{{ formatNumber(documentDetail?.recallCount || 0) }} 命中</Tag>
            <Tag>{{ formatDateTime(documentDetail?.updatedAt) }} 最后编辑</Tag>
          </p>
        </div>
      </div>

      <div class="knowledge-chunks-toolbar">
        <Input
          v-model:value="searchValue"
          class="knowledge-chunks-search"
          placeholder="输入关键词搜索片段"
          allow-clear
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </Input>
        <div class="knowledge-chunks-actions">
          <span class="knowledge-chunks-status">
            <i class="status-dot is-enabled" />
            <span>可用</span>
          </span>
          <Button @click="openCreateModal">
            <template #icon>
              <PlusOutlined />
            </template>
            添加片段
          </Button>
        </div>
      </div>
    </header>

    <main class="knowledge-chunks-main">
      <div v-if="chunks.length" class="knowledge-chunks-grid">
        <article v-for="chunk in chunks" :key="chunk.id" class="chunk-card">
          <div class="chunk-card__head">
            <Tag># {{ String(chunk.chunkIndex + 1).padStart(3, '0') }}</Tag>
            <div class="chunk-card__status">
              <span>{{ chunk.enabled ? '已启用' : '已禁用' }}</span>
              <i class="status-dot" :class="{ 'is-enabled': chunk.enabled }" />
              <Switch
                size="small"
                :checked="chunk.enabled"
                @change="(checked: unknown) => toggleChunk(chunk, checked === true)"
              />
            </div>
          </div>
          <button class="chunk-card__body" type="button" @click="openEditModal(chunk)">
            {{ chunk.text }}
          </button>
          <footer>
            <span>{{ formatNumber(chunk.characterCount) }} 字符</span>
            <span>{{ formatNumber(chunk.recallCount || 0) }} 命中</span>
            <div class="chunk-card__actions">
              <Button
                type="text"
                shape="circle"
                title="删除片段"
                aria-label="删除片段"
                @click="confirmDeleteChunk(chunk)"
              >
                <template #icon>
                  <DeleteOutlined />
                </template>
              </Button>
            </div>
          </footer>
        </article>
      </div>
      <div v-else class="knowledge-chunks-empty">
        {{ loading ? '片段加载中' : '暂无片段' }}
      </div>
    </main>

    <AppModal
      v-model:open="modalOpen"
      :title="modalTitle"
      :confirm-loading="saving"
      ok-text="保存"
      cancel-text="取消"
      width="52rem"
      destroy-on-hidden
      @ok="submitChunk"
    >
      <div class="chunk-form">
        <label>
          <span>片段内容 <b>*</b></span>
          <TextArea
            v-model:value="formModel.text"
            placeholder="在这里添加文档片段内容"
            :maxlength="20000"
            :rows="8"
          />
        </label>
        <label>
          <span>关键词</span>
          <Select
            v-model:value="formModel.keywords"
            class="chunk-keywords-select"
            mode="tags"
            :max-tag-count="10"
            :open="false"
            :token-separators="[',', '，']"
            placeholder="请输入该文档片段关键词，最多不超过10个，按Enter输入"
          />
        </label>
      </div>
    </AppModal>
  </div>
</template>

<style src="./index.scss" scoped lang="scss"></style>
