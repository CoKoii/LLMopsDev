<script setup lang="ts">
import {
  deleteKnowledgeDocumentApi,
  getKnowledgeApi,
  listKnowledgeDocumentsApi,
  recallTestApi,
  updateKnowledgeDocumentApi,
  type KnowledgeDocumentItem,
  type KnowledgeItem,
  type KnowledgeRecallStrategy,
  type RecallTestResultItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  BookOutlined,
  EllipsisOutlined,
  SearchOutlined,
  TranslationOutlined,
} from '@antdv-next/icons'
import {
  Badge,
  Button,
  Dropdown,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Slider,
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
const recallModalOpen = ref(false)
const recallSettingsOpen = ref(false)
const recallDetailOpen = ref(false)
const recallLoading = ref(false)
const recallQuery = ref('')
const recallStrategy = ref<KnowledgeRecallStrategy>('hybrid')
const recallLimit = ref(5)
const recallMinScore = ref(0.4)
const recallResults = ref<RecallTestResultItem[]>([])
const activeRecallItem = ref<RecallTestResultItem>()
const recallRecentQueries = ref<
  Array<{ id: string; source: string; text: string; createdAt: string }>
>([])
let pollingTimer: ReturnType<typeof window.setTimeout> | undefined
let tableResizeObserver: ResizeObserver | undefined
let tableScrollSyncQueued = false

const MIN_TABLE_SCROLL_Y = 160
const RECALL_HISTORY_STORAGE_KEY = 'knowledge-recall-test-history'
const MAX_RECALL_HISTORY_COUNT = 8
const MAX_RECALL_KEYWORD_COUNT = 4

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

const recallQueryLength = computed(() => recallQuery.value.length)

const recallDetailTitle = computed(() =>
  activeRecallItem.value
    ? `片段详情  # ${String(activeRecallItem.value.chunkIndex + 1).padStart(3, '0')}`
    : '片段详情',
)

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

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

const formatRecallSource = (source: KnowledgeRecallStrategy) => {
  if (source === 'vector') return '向量检索'
  if (source === 'text') return '全文检索'
  return '混合检索'
}

const formatRecallScore = (score: number) => Number(score.toFixed(2)).toFixed(2)

const formatRecallScorePercent = (score: number) => `${Math.min(Math.max(score, 0), 1) * 100}%`

const getRecallKeywords = (record?: RecallTestResultItem) => {
  const keywords = record?.metadata?.keywords
  return Array.isArray(keywords)
    ? keywords
        .filter((item): item is string => typeof item === 'string')
        .slice(0, MAX_RECALL_KEYWORD_COUNT)
    : []
}

const getRecallKeywordOptions = (record?: RecallTestResultItem) =>
  getRecallKeywords(record).map((keyword) => ({
    label: keyword,
    value: keyword,
  }))

const hasDocumentFailed = (record: KnowledgeDocumentItem) =>
  record.parseStatus === 'failed' ||
  record.cleanStatus === 'failed' ||
  record.enhanceStatus === 'failed' ||
  record.chunkStatus === 'failed' ||
  record.embeddingStatus === 'failed' ||
  record.indexStatus === 'failed'

const isDocumentReady = (record: KnowledgeDocumentItem) => record.indexStatus === 'indexed'

const resolveDocumentFailure = (record: KnowledgeDocumentItem) => {
  if (record.parseStatus === 'failed') return '解析失败'
  if (record.cleanStatus === 'failed') return '清洗失败'
  if (record.enhanceStatus === 'failed') return '增强失败'
  if (record.chunkStatus === 'failed') return '切片失败'
  if (record.embeddingStatus === 'failed') return '向量化失败'
  if (record.indexStatus === 'failed') return '入库失败'
  return '处理失败'
}

const resolveDocumentProgress = (record: KnowledgeDocumentItem) => {
  if (record.indexStatus === 'indexing') return '写入索引'
  if (record.embeddingStatus === 'embedding') return '向量化中'
  if (record.embeddingStatus === 'embedded') return '写入索引'
  if (record.embeddingStatus === 'queued') return '等待向量化'
  if (record.chunkStatus === 'chunking') return '切片中'
  if (record.chunkStatus === 'chunked') return '等待向量化'
  if (record.enhanceStatus === 'enhancing') return '增强中'
  if (record.enhanceStatus === 'enhanced') return '切片中'
  if (record.cleanStatus === 'cleaning') return '清洗中'
  if (record.cleanStatus === 'cleaned') return '切片中'
  if (record.parseStatus === 'parsing') return '解析中'
  if (record.parseStatus === 'parsed') return '清洗中'
  return '等待处理'
}

const resolveDocumentStatus = (record: KnowledgeDocumentItem) => {
  if (hasDocumentFailed(record)) {
    return { status: 'error' as const, text: resolveDocumentFailure(record) }
  }
  if (!isDocumentReady(record)) {
    return { status: 'processing' as const, text: resolveDocumentProgress(record) }
  }
  if (!record.enabled) {
    return { status: 'default' as const, text: '已禁用' }
  }
  return { status: 'success' as const, text: '可用' }
}

const loadRecallHistory = () => {
  try {
    const value = window.localStorage.getItem(RECALL_HISTORY_STORAGE_KEY)
    if (!value) {
      recallRecentQueries.value = []
      return
    }

    const items = JSON.parse(value) as typeof recallRecentQueries.value
    recallRecentQueries.value = Array.isArray(items) ? items.slice(0, MAX_RECALL_HISTORY_COUNT) : []
  } catch {
    recallRecentQueries.value = []
  }
}

const saveRecallHistory = (text: string, source: string) => {
  const nextItem = {
    id: `${Date.now()}`,
    source,
    text,
    createdAt: new Date().toISOString(),
  }
  const nextItems = [
    nextItem,
    ...recallRecentQueries.value.filter((item) => item.text !== text),
  ].slice(0, MAX_RECALL_HISTORY_COUNT)
  recallRecentQueries.value = nextItems
  window.localStorage.setItem(RECALL_HISTORY_STORAGE_KEY, JSON.stringify(nextItems))
}

const isProcessingDocument = (record: KnowledgeDocumentItem) =>
  !hasDocumentFailed(record) && !isDocumentReady(record)

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

const openDocumentChunks = (record: KnowledgeDocumentItem) => {
  void router.push({
    name: 'knowledge-file-chunks',
    params: {
      knowledgeId: parseKnowledgeId(),
      documentId: record.id,
    },
  })
}

const handleDocumentTableClick = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const row = target.closest<HTMLTableRowElement>('tr[data-row-key]')
  if (!row) return

  const documentId = Number(row.dataset.rowKey)
  const document = documents.value.find((item) => item.id === documentId)
  if (document) {
    openDocumentChunks(document)
  }
}

const openRecallTest = () => {
  loadRecallHistory()
  recallModalOpen.value = true
}

const submitRecallTest = async (text = recallQuery.value) => {
  const knowledgeId = parseKnowledgeId()
  const query = text.trim()
  if (!Number.isFinite(knowledgeId) || !query) {
    message.warning('请输入召回测试文本')
    return
  }

  recallQuery.value = query
  recallLoading.value = true
  try {
    const result = await recallTestApi(knowledgeId, {
      query,
      strategy: recallStrategy.value,
      limit: recallLimit.value,
      minScore: recallMinScore.value,
    })
    recallResults.value = result.items
    saveRecallHistory(query, formatRecallSource(result.strategy))
    await loadKnowledge({ silent: true })
    if (!result.items.length) {
      message.info('未召回匹配片段')
    }
  } finally {
    recallLoading.value = false
  }
}

const openRecallDetail = (record: RecallTestResultItem) => {
  activeRecallItem.value = record
  recallDetailOpen.value = true
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
          <Button @click="openRecallTest">召回测试</Button>
          <Button type="primary" @click="addFile">添加文件</Button>
        </Space>
      </div>
    </header>

    <main class="knowledge-files-main">
      <div ref="tableContainerRef" class="knowledge-table" @click="handleDocumentTableClick">
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
            <template v-if="column.key === 'name'">
              <button class="knowledge-document-link" type="button" @click.stop="openDocumentChunks(record)">
                {{ record.name }}
              </button>
            </template>
            <template v-else-if="column.key === 'characterCount'">
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
                :status="resolveDocumentStatus(record).status"
                :text="resolveDocumentStatus(record).text"
              />
            </template>
            <template v-else-if="column.key === 'operation'">
              <Space @click.stop>
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
      v-model:open="recallModalOpen"
      title="召回测试"
      width="112rem"
      :footer="null"
      destroy-on-hidden
    >
      <div class="recall-test">
        <p class="recall-test__desc">基于给定的查询文本测试知识库的召回效果</p>

        <div class="recall-test__body">
          <section class="recall-query-panel">
            <div class="recall-query-box">
              <div class="recall-query-box__head">
                <strong>源文本</strong>
                <Button
                  class="recall-strategy-button"
                  size="small"
                  @click="recallSettingsOpen = true"
                >
                  <template #icon>
                    <TranslationOutlined />
                  </template>
                  {{ formatRecallSource(recallStrategy) }}
                </Button>
              </div>
              <textarea
                v-model="recallQuery"
                maxlength="200"
                placeholder="请输入文本，建议使用简短的陈述句"
                @keydown.meta.enter.prevent="submitRecallTest()"
                @keydown.ctrl.enter.prevent="submitRecallTest()"
              />
              <div class="recall-query-box__footer">
                <span>{{ recallQueryLength }} / 200</span>
                <Button type="primary" :loading="recallLoading" @click="submitRecallTest()">
                  测试
                </Button>
              </div>
            </div>

            <div class="recall-history">
              <h3>最近查询</h3>
              <div v-if="recallRecentQueries.length" class="recall-history__table">
                <button
                  v-for="item in recallRecentQueries"
                  :key="item.id"
                  class="recall-history__row"
                  type="button"
                  @click="submitRecallTest(item.text)"
                >
                  <span>{{ item.source }}</span>
                  <strong>{{ item.text }}</strong>
                  <time>{{ formatTime(item.createdAt) }}</time>
                </button>
              </div>
              <p v-else class="recall-empty-text">暂无查询记录</p>
            </div>
          </section>

          <section class="recall-results">
            <div v-if="recallResults.length" class="recall-result-grid">
              <button
                v-for="item in recallResults"
                :key="item.chunkId"
                class="recall-result-card"
                type="button"
                @click="openRecallDetail(item)"
              >
                <div class="recall-result-card__score">
                  <span class="recall-result-card__icon" />
                  <span class="recall-score-bar">
                    <i :style="{ width: formatRecallScorePercent(item.score) }" />
                  </span>
                  <strong>{{ formatRecallScore(item.score) }}</strong>
                </div>
                <p>{{ item.text }}</p>
                <footer>
                  <span class="recall-result-card__file-icon">T</span>
                  <span :title="item.documentName">{{ item.documentName }}</span>
                </footer>
              </button>
            </div>
            <div v-else class="recall-empty">
              <SearchOutlined />
              <span>输入文本后开始测试</span>
            </div>
          </section>
        </div>
      </div>
    </AppModal>

    <AppModal
      v-model:open="recallSettingsOpen"
      title="检索设置"
      width="56rem"
      ok-text="确定"
      cancel-text="取消"
      @ok="recallSettingsOpen = false"
    >
      <div class="recall-settings">
        <div class="recall-settings__row">
          <span>检索策略</span>
          <RadioGroup v-model:value="recallStrategy" class="recall-settings__options">
            <Radio value="hybrid">混合检索</Radio>
            <Radio value="vector">向量检索</Radio>
            <Radio value="text">全文检索</Radio>
          </RadioGroup>
        </div>
        <div class="recall-settings__row">
          <span>最大召回数量</span>
          <div class="recall-setting-control">
            <Slider v-model:value="recallLimit" :min="1" :max="20" :step="1" />
            <InputNumber v-model:value="recallLimit" :min="1" :max="20" />
          </div>
        </div>
        <div class="recall-settings__row">
          <span>最小匹配度</span>
          <div class="recall-setting-control">
            <Slider v-model:value="recallMinScore" :min="0" :max="1" :step="0.01" />
            <InputNumber v-model:value="recallMinScore" :min="0" :max="1" :step="0.01" />
          </div>
        </div>
      </div>
    </AppModal>

    <AppModal
      v-model:open="recallDetailOpen"
      :title="recallDetailTitle"
      width="52rem"
      ok-text="确定"
      cancel-text="取消"
      @ok="recallDetailOpen = false"
    >
      <div v-if="activeRecallItem" class="recall-detail">
        <label>
          <span>片段内容 <b>*</b></span>
          <textarea :value="activeRecallItem.text" readonly />
        </label>
        <label v-if="getRecallKeywords(activeRecallItem).length">
          <span>关键词</span>
          <Select
            class="recall-keywords-select"
            mode="multiple"
            :value="getRecallKeywords(activeRecallItem)"
            :options="getRecallKeywordOptions(activeRecallItem)"
            :open="false"
          />
        </label>
      </div>
    </AppModal>

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
