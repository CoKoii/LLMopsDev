<script setup lang="ts">
import {
  deleteKnowledgeDocumentApi,
  getKnowledgeApi,
  listKnowledgeDocumentsApi,
  updateKnowledgeDocumentApi,
  type KnowledgeDocumentItem,
  type KnowledgeItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import { BookOutlined, EllipsisOutlined, SearchOutlined } from '@antdv-next/icons'
import {
  Badge,
  Button,
  Dropdown,
  Input,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  type MenuProps,
} from 'antdv-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const knowledge = ref<KnowledgeItem>()
const loading = ref(false)
const searchValue = ref('')
const documents = ref<KnowledgeDocumentItem[]>([])
const documentTotal = ref(0)
const tableContainerRef = ref<HTMLDivElement>()
const tableScrollY = ref(240)
const renameModalOpen = ref(false)
const renameSaving = ref(false)
const renameDocumentId = ref<number>()
const renameName = ref('')
let pollingTimer: ReturnType<typeof window.setTimeout> | undefined
let tableResizeObserver: ResizeObserver | undefined
let tableScrollSyncQueued = false

const MIN_TABLE_SCROLL_Y = 160

const columns = [
  { title: '#', dataIndex: 'id', key: 'id', width: 72, align: 'center' as const },
  { title: '文档名', dataIndex: 'name', key: 'name' },
  { title: '字符数', dataIndex: 'characterCount', key: 'characterCount' },
  { title: '切块数', dataIndex: 'chunkCount', key: 'chunkCount' },
  { title: '召回次数', dataIndex: 'recallCount', key: 'recallCount' },
  { title: '上传时间', dataIndex: 'createdAt', key: 'createdAt' },
  { title: '状态', dataIndex: 'enabled', key: 'enabled' },
  { title: '操作', key: 'operation', align: 'center' as const },
]

const fileActionMenuItems: MenuProps['items'] = [
  { key: 'rename', label: '重命名' },
  { key: 'delete', label: '删除', danger: true },
]

const pagination = ref({
  current: 1,
  pageSize: 20,
})

const tablePagination = computed(() => ({
  current: pagination.value.current,
  pageSize: pagination.value.pageSize,
  total: documentTotal.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 个文档`,
}))

const tableScroll = computed(() => ({
  y: tableScrollY.value,
}))

const totalCharacterCount = computed(() =>
  documents.value.reduce((total, item) => total + item.characterCount, 0),
)

const knowledgeTitle = computed(() =>
  knowledge.value ? `知识库 / ${knowledge.value.name}` : '知识库',
)

const parseKnowledgeId = () => {
  const value = route.params.knowledgeId
  return Number(Array.isArray(value) ? value[0] : value)
}

const formatCompactNumber = (value: number) => {
  if (value >= 1000) {
    return `${Number((value / 1000).toFixed(1))}k`
  }
  return String(value)
}

const formatNumber = (value: number) => value.toLocaleString('en-US')

const formatDateTime = (value?: string) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const isProcessingDocument = (record: KnowledgeDocumentItem) =>
  record.parseStatus === 'parsing' ||
  record.cleanStatus === 'cleaning' ||
  record.enhanceStatus === 'enhancing' ||
  record.chunkStatus === 'chunking' ||
  record.embeddingStatus === 'queued' ||
  record.embeddingStatus === 'embedding' ||
  record.indexStatus === 'indexing'

const clearPollingTimer = () => {
  if (pollingTimer !== undefined) {
    window.clearTimeout(pollingTimer)
    pollingTimer = undefined
  }
}

const schedulePolling = () => {
  clearPollingTimer()
  if (!documents.value.some(isProcessingDocument)) return

  pollingTimer = window.setTimeout(() => {
    void loadKnowledge({ silent: true })
  }, 3000)
}

const updateTableScroll = () => {
  const container = tableContainerRef.value
  if (!container) return

  const header = container.querySelector<HTMLElement>('.ant-table-thead')
  const paginationElement = container.querySelector<HTMLElement>('.ant-pagination')
  const headerHeight = header?.offsetHeight ?? 0
  const paginationHeight = paginationElement?.offsetHeight ?? 0
  const paginationMargin = paginationElement
    ? Number.parseFloat(window.getComputedStyle(paginationElement).marginTop || '0')
    : 0
  const nextHeight = Math.floor(
    container.clientHeight - headerHeight - paginationHeight - paginationMargin,
  )
  const nextScrollY = Math.max(nextHeight, MIN_TABLE_SCROLL_Y)

  if (tableScrollY.value !== nextScrollY) {
    tableScrollY.value = nextScrollY
  }
}

const syncTableScroll = () => {
  if (tableScrollSyncQueued) return

  tableScrollSyncQueued = true
  void nextTick(() => {
    tableScrollSyncQueued = false
    updateTableScroll()
  })
}

const loadKnowledge = async (options: { silent?: boolean } = {}) => {
  const knowledgeId = parseKnowledgeId()
  if (!Number.isFinite(knowledgeId)) return

  if (!options.silent) {
    loading.value = true
  }
  try {
    const [knowledgeDetail, documentResult] = await Promise.all([
      getKnowledgeApi(knowledgeId),
      listKnowledgeDocumentsApi(knowledgeId, {
        page: pagination.value.current,
        pageSize: pagination.value.pageSize,
        name: searchValue.value.trim() || undefined,
      }),
    ])
    knowledge.value = knowledgeDetail
    documents.value = documentResult.items
    documentTotal.value = documentResult.total
    syncTableScroll()
    schedulePolling()
  } catch {
    if (!options.silent) {
      message.error('知识库详情获取失败')
      documents.value = []
      documentTotal.value = 0
    } else {
      schedulePolling()
    }
  } finally {
    if (!options.silent) {
      loading.value = false
    }
  }
}

const handleTableChange = (nextPagination: { current?: number; pageSize?: number }) => {
  const nextPageSize = nextPagination.pageSize ?? pagination.value.pageSize
  pagination.value = {
    current:
      nextPageSize === pagination.value.pageSize
        ? (nextPagination.current ?? pagination.value.current)
        : 1,
    pageSize: nextPageSize,
  }
  void loadKnowledge()
}

const runRecallTest = () => {
  message.info('召回测试功能待接入')
}

const addFile = () => {
  void router.push({
    name: 'knowledge-files-add',
    params: { knowledgeId: parseKnowledgeId() },
  })
}

const toggleFile = async (record: KnowledgeDocumentItem, checked: boolean) => {
  const knowledgeId = parseKnowledgeId()
  if (!Number.isFinite(knowledgeId)) return

  const previousEnabled = record.enabled
  record.enabled = checked
  try {
    await updateKnowledgeDocumentApi(knowledgeId, record.id, { enabled: checked })
    message.success(checked ? '文档已启用' : '文档已禁用')
  } catch {
    record.enabled = previousEnabled
  }
}

const openRenameModal = (record: KnowledgeDocumentItem) => {
  renameDocumentId.value = record.id
  renameName.value = record.name
  renameModalOpen.value = true
}

const submitRename = async () => {
  const name = renameName.value.trim()
  if (!name || renameDocumentId.value === undefined) return

  renameSaving.value = true
  try {
    const knowledgeId = parseKnowledgeId()
    if (!Number.isFinite(knowledgeId)) return

    const updatedDocument = await updateKnowledgeDocumentApi(knowledgeId, renameDocumentId.value, {
      name,
    })
    documents.value = documents.value.map((item) =>
      item.id === updatedDocument.id ? updatedDocument : item,
    )
    message.success('文档已重命名')
    renameModalOpen.value = false
  } finally {
    renameSaving.value = false
  }
}

const confirmDeleteFile = (record: KnowledgeDocumentItem) => {
  Modal.confirm({
    title: '要删除该文档吗？',
    content: '删除后，该文档将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      const knowledgeId = parseKnowledgeId()
      if (!Number.isFinite(knowledgeId)) return

      await deleteKnowledgeDocumentApi(knowledgeId, record.id)
      message.success('文档已删除')
      if (documents.value.length === 1 && pagination.value.current > 1) {
        pagination.value.current -= 1
      }
      await loadKnowledge()
    },
  })
}

const handleFileAction = (event: { key: string | number }, record: KnowledgeDocumentItem) => {
  if (event.key === 'rename') {
    openRenameModal(record)
    return
  }

  if (event.key === 'delete') {
    confirmDeleteFile(record)
  }
}

watch(
  () => route.params.knowledgeId,
  () => {
    pagination.value.current = 1
    void loadKnowledge()
  },
  { immediate: true },
)

watch(searchValue, () => {
  pagination.value.current = 1
  void loadKnowledge()
})

onMounted(() => {
  tableResizeObserver = new ResizeObserver(syncTableScroll)
  if (tableContainerRef.value) {
    tableResizeObserver.observe(tableContainerRef.value)
  }
  syncTableScroll()
})

onUnmounted(() => {
  clearPollingTimer()
  tableResizeObserver?.disconnect()
})
</script>

<template>
  <div class="knowledge-files-page">
    <header class="knowledge-files-header">
      <div class="knowledge-header-main">
        <div class="knowledge-entity">
          <div class="knowledge-entity__logo" :class="{ 'has-image': knowledge?.icon }">
            <img v-if="knowledge?.icon" :src="knowledge.icon" alt="" />
            <BookOutlined v-else />
          </div>
          <div class="knowledge-entity__identity">
            <div>
              <h1>{{ knowledgeTitle }}</h1>
            </div>
            <p>
              <Tag>{{ documentTotal }} 文档</Tag>
              <Tag>{{ formatNumber(totalCharacterCount) }} 命中</Tag>
              <Tag>3 关联应用</Tag>
            </p>
          </div>
        </div>
      </div>

      <div class="knowledge-toolbar">
        <div class="knowledge-search">
          <Input v-model:value="searchValue" placeholder="输入关键词搜索文档" allow-clear>
            <template #prefix>
              <SearchOutlined />
            </template>
          </Input>
        </div>
        <Space>
          <Button @click="runRecallTest">召回测试</Button>
          <Button type="primary" @click="addFile">添加文件</Button>
        </Space>
      </div>
    </header>

    <main class="knowledge-files-main">
      <div ref="tableContainerRef" class="knowledge-table">
        <Table
          row-key="id"
          size="small"
          :columns="columns"
          :data-source="documents"
          :loading="loading"
          :pagination="tablePagination"
          :scroll="tableScroll"
          :locale="{ emptyText: '暂无文档' }"
          @change="handleTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'characterCount'">
              {{ formatCompactNumber(record.characterCount) }}
            </template>
            <template v-else-if="column.key === 'chunkCount'">
              {{ record.chunkCount || 0 }}
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDateTime(record.createdAt) }}
            </template>
            <template v-else-if="column.key === 'enabled'">
              <Badge
                :status="record.enabled ? 'success' : 'default'"
                :text="record.enabled ? '可用' : '已禁用'"
              />
            </template>
            <template v-else-if="column.key === 'operation'">
              <Space>
                <Switch
                  size="small"
                  :checked="record.enabled"
                  @change="(checked: unknown) => toggleFile(record, checked === true)"
                />
                <Dropdown
                  :trigger="['click']"
                  :menu="{ items: fileActionMenuItems }"
                  @menu-click="(event) => handleFileAction(event, record)"
                >
                  <Button type="text" shape="circle" title="更多操作" aria-label="更多操作">
                    <template #icon>
                      <EllipsisOutlined />
                    </template>
                  </Button>
                </Dropdown>
              </Space>
            </template>
          </template>
        </Table>
      </div>
    </main>

    <AppModal
      v-model:open="renameModalOpen"
      title="重命名文档"
      :confirm-loading="renameSaving"
      ok-text="保存"
      cancel-text="取消"
      width="42rem"
      destroy-on-hidden
      @ok="submitRename"
    >
      <Input v-model:value="renameName" placeholder="请输入文档名称" :maxlength="120" />
    </AppModal>
  </div>
</template>

<style src="./detail.scss" scoped lang="scss"></style>
