<script setup lang="ts">
import { getKnowledgeApi, type KnowledgeItem } from '@/api'
import { BookOutlined, EllipsisOutlined, SearchOutlined } from '@antdv-next/icons'
import {
  Badge,
  Button,
  Dropdown,
  Input,
  message,
  Space,
  Switch,
  Table,
  Tag,
  type MenuProps,
} from 'antdv-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

interface KnowledgeDocument {
  id: number
  name: string
  characterCount: number
  recallCount: number
  uploadedAt: string
  enabled: boolean
}

const route = useRoute()
const knowledge = ref<KnowledgeItem>()
const loading = ref(false)
const searchValue = ref('')
const documents = ref<KnowledgeDocument[]>([])

const documentSeeds = [
  ['LLMOps 项目提示词.md', 4700, 18, '2024-06-11 23:31:47', false],
  ['课程Prompt提示词.txt', 2100, 0, '2024-04-07 09:22:00', true],
  ['Readme.md', 1700, 12, '2024-01-08 13:20:10', true],
  ['慕课LLMOps代码库.txt', 12500, 13, '2024-05-14 14:35:27', false],
  ['LLMOps 项目API文档.md', 95100, 154, '2024-01-07 12:18:04', true],
  ['基于工具调用的智能体设计与实现.md', 14800, 42, '2024-02-01 21:16:25', true],
] as const

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

const createMockDocuments = () =>
  Array.from({ length: 21 }, (_, index) => {
    const item = documentSeeds[index % documentSeeds.length]!
    return {
      id: 21 - index,
      name: item[0],
      characterCount: item[1],
      recallCount: item[2],
      uploadedAt: item[3],
      enabled: item[4],
    }
  })

const loadKnowledge = async () => {
  const knowledgeId = parseKnowledgeId()
  if (!Number.isFinite(knowledgeId)) return

  loading.value = true
  try {
    knowledge.value = await getKnowledgeApi(knowledgeId)
    documents.value = createMockDocuments()
  } catch {
    message.error('知识库详情获取失败')
    documents.value = createMockDocuments()
  } finally {
    loading.value = false
  }
}

const runRecallTest = () => {
  message.info('召回测试功能待接入')
}

const addFile = () => {
  message.info('文件上传接口待接入')
}

const toggleFile = (record: KnowledgeDocument, checked: boolean) => {
  record.enabled = checked
  message.success(checked ? '文档已启用' : '文档已禁用')
}

const handleFileAction = (event: { key: string | number }, record: KnowledgeDocument) => {
  if (event.key === 'rename') {
    message.info(`重命名 ${record.name}`)
    return
  }

  if (event.key === 'delete') {
    documents.value = documents.value.filter((item) => item.id !== record.id)
    message.success('文档已删除')
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
        <Input
          v-model:value="searchValue"
          class="knowledge-search"
          placeholder="输入关键词搜索文档"
          allow-clear
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </Input>
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
  </div>
</template>

<style scoped lang="scss">
.knowledge-files-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 2.4rem;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--font-color);
}

.knowledge-files-header {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  margin-bottom: 2.4rem;
}

.knowledge-header-main {
  display: flex;
  align-items: center;
  min-height: 4rem;
}

.knowledge-entity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 1.2rem;
}

.knowledge-entity__logo {
  display: grid;
  width: 4rem;
  height: 4rem;
  place-items: center;
  flex: 0 0 auto;
  color: var(--white);
  background: var(--primary-color);
  border-radius: 0.8rem;
}

.knowledge-entity__logo.has-image {
  overflow: hidden;
  background: var(--touch-bg);
}

.knowledge-entity__logo :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.knowledge-entity__identity {
  min-width: 0;
}

.knowledge-entity__identity > div,
.knowledge-entity__identity p {
  display: flex;
  align-items: center;
  min-width: 0;
}

.knowledge-entity__identity h1 {
  margin: 0;
  overflow: hidden;
  color: var(--font-active-color);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-entity__identity p {
  margin: 0.2rem 0 0;
  gap: 0.4rem;
}

.knowledge-files-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.knowledge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
}

.knowledge-search {
  width: 24rem;
}

.knowledge-table {
  flex: 1;
  min-height: 0;
  overflow: auto;

  :deep(.ant-table-thead > tr > th) {
    background: #e5e7eb;
  }
}
</style>
