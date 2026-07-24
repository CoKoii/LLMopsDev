<script setup lang="ts">
import { getKnowledgeApi, type KnowledgeItem } from '@/api'
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createMockDocuments, readUploadedDocuments, type KnowledgeDocument } from './documents'

const route = useRoute()
const router = useRouter()
const knowledge = ref<KnowledgeItem>()
const loading = ref(false)
const searchValue = ref('')
const documents = ref<KnowledgeDocument[]>([])
const renameModalOpen = ref(false)
const renameSaving = ref(false)
const renameDocumentId = ref<number>()
const renameName = ref('')

const columns = [
  { title: '#', dataIndex: 'id', key: 'id', width: 72, align: 'center' as const },
  { title: '文档名', dataIndex: 'name', key: 'name' },
  { title: '字符数', dataIndex: 'characterCount', key: 'characterCount' },
  { title: '召回次数', dataIndex: 'recallCount', key: 'recallCount' },
  { title: '上传时间', dataIndex: 'uploadedAt', key: 'uploadedAt' },
  { title: '状态', dataIndex: 'enabled', key: 'enabled' },
  { title: '操作', key: 'operation', align: 'center' as const },
]

const fileActionMenuItems: MenuProps['items'] = [
  { key: 'rename', label: '重命名' },
  { key: 'delete', label: '删除', danger: true },
]

const tablePagination = {
  pageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50'],
  showTotal: (total: number) => `共 ${total} 个文档`,
}

const filteredDocuments = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase()
  if (!keyword) return documents.value

  return documents.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

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

const loadKnowledge = async () => {
  const knowledgeId = parseKnowledgeId()
  if (!Number.isFinite(knowledgeId)) return

  loading.value = true
  try {
    knowledge.value = await getKnowledgeApi(knowledgeId)
  } catch {
    message.error('知识库详情获取失败')
  } finally {
    documents.value = [...readUploadedDocuments(knowledgeId), ...createMockDocuments()]
    loading.value = false
  }
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

const toggleFile = (record: KnowledgeDocument, checked: boolean) => {
  record.enabled = checked
  message.success(checked ? '文档已启用' : '文档已禁用')
}

const openRenameModal = (record: KnowledgeDocument) => {
  renameDocumentId.value = record.id
  renameName.value = record.name
  renameModalOpen.value = true
}

const submitRename = async () => {
  const name = renameName.value.trim()
  if (!name || renameDocumentId.value === undefined) return

  renameSaving.value = true
  try {
    documents.value = documents.value.map((item) =>
      item.id === renameDocumentId.value ? { ...item, name } : item,
    )
    message.success('文档已重命名')
    renameModalOpen.value = false
  } finally {
    renameSaving.value = false
  }
}

const confirmDeleteFile = (record: KnowledgeDocument) => {
  Modal.confirm({
    title: '要删除该文档吗？',
    content: '删除后，该文档将从列表中移除。',
    centered: true,
    keyboard: true,
    maskClosable: true,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      documents.value = documents.value.filter((item) => item.id !== record.id)
      message.success('文档已删除')
    },
  })
}

const handleFileAction = (event: { key: string | number }, record: KnowledgeDocument) => {
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
    void loadKnowledge()
  },
  { immediate: true },
)
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
              <Tag>{{ documents.length }} 文档</Tag>
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
      <div class="knowledge-table">
        <Table
          row-key="id"
          size="small"
          :columns="columns"
          :data-source="filteredDocuments"
          :loading="loading"
          :pagination="tablePagination"
          :locale="{ emptyText: '暂无文档' }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'characterCount'">
              {{ formatCompactNumber(record.characterCount) }}
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
