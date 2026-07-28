<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import {
  getPluginApi,
  getAiAppMemoryApi,
  listKnowledgeApi,
  listPluginCategoriesApi,
  listPluginsApi,
  updateAiAppMemoryApi,
  type AppChatMemory,
  type AppKnowledgeCitation,
  type AppKnowledgeRecallSettings,
  type AppPluginOperationSettings,
  type AppVersionKnowledgeItem,
  type AppVersionPluginItem,
  type KnowledgeItem,
  type PluginCategoryItem,
  type PluginItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import {
  BookOpen,
  Bot,
  Code2,
  ChevronDown,
  Copy,
  Calculator,
  Database,
  Globe2,
  Image,
  Info,
  MessageCircle,
  MessagesSquare,
  MinusCircle,
  Search,
  Plus,
  Settings,
  Trash2,
  UsersRound,
  Wrench,
  Workflow,
} from '@lucide/vue'
import { Prompts } from 'ant-design-x-vue'
import type { BubbleListProps } from 'ant-design-x-vue'
import {
  Button,
  Input,
  InputNumber,
  Radio,
  RadioGroup,
  Slider,
  Switch,
  TextArea,
  message,
} from 'antdv-next'
import { computed, h, nextTick, onMounted, ref, type Component, type VNode } from 'vue'
import { useRoute } from 'vue-router'
import {
  configToggles,
  knowledgeLimit,
  openingQuestionLimit,
  useAppOrchestrationDraft,
  type CapabilityItem,
} from './useAppOrchestrationDraft'
import { useAppDebugSession } from './useAppDebugSession'
import AppOrchestrationTopbar from './AppOrchestrationTopbar.vue'
import DebugPreviewPanel from './DebugPreviewPanel.vue'
import PromptOptimizeModal from './PromptOptimizeModal.vue'
import PromptEditorPanel from './PromptEditorPanel.vue'
import PluginSettingsDrawer from './PluginSettingsDrawer.vue'
import PublishConfigView from './PublishConfigView.vue'
import PublishHistoryDrawer from './PublishHistoryDrawer.vue'
import ResourceSelectionModals from './ResourceSelectionModals.vue'
import StatsAnalysisView from './StatsAnalysisView.vue'

type ChatMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  footer?: VNode
  pending?: boolean
  knowledgeQuery?: string
  knowledgeCitations?: AppKnowledgeCitation[]
}

const route = useRoute()
const authStore = useAuthStore()
const allPluginCategoryKey = '__all__'
const modelSettingsOpen = ref(false)
const pluginModalOpen = ref(false)
const pluginSettingsOpen = ref(false)
const pluginSettingsLoading = ref(false)
const pluginSettingsRecord = ref<PluginItem>()
const knowledgeModalOpen = ref(false)
const knowledgeSettingsOpen = ref(false)
const publishHistoryOpen = ref(false)
const promptOptimizeOpen = ref(false)
const memoryModalOpen = ref(false)
const memoryLoading = ref(false)
const memorySaving = ref(false)
const memoryRecord = ref<AppChatMemory>()
const memoryDraft = ref('')
const promptOptimizeSource = ref('')
const promptOptimizeResult = ref('')
const chatPreviewRef = ref<InstanceType<typeof DebugPreviewPanel>>()
const promptOptimizeModalRef = ref<InstanceType<typeof PromptOptimizeModal>>()
const pluginCatalog = ref<PluginItem[]>([])
const pluginCatalogCache = ref<PluginItem[]>([])
const pluginCategoryCatalog = ref<PluginCategoryItem[]>([])
const pluginCatalogLoading = ref(false)
const knowledgeCatalog = ref<KnowledgeItem[]>([])
const knowledgeCatalogCache = ref<KnowledgeItem[]>([])
const knowledgeCatalogLoading = ref(false)
const knowledgeSettingsDraft = ref<Required<AppKnowledgeRecallSettings>>({
  strategy: 'hybrid',
  limit: 5,
  minScore: 0.4,
})
const activePluginSourceKey = ref<PluginSourceKey>('custom')
const activePluginCategoryKey = ref(allPluginCategoryKey)
let promptOptimizeAbortController: AbortController | undefined
let pluginCatalogRequestId = 0
let knowledgeCatalogRequestId = 0
const pageTabs = [
  { page: 'edit', label: '编辑' },
  { page: 'publish', label: '发布配置' },
  { page: 'stats', label: '统计分析' },
] as const
type PageTab = (typeof pageTabs)[number]['page']
type PluginSourceKey = 'custom' | 'category'
type PluginCategoryOption = {
  key: string
  name: string
  sort: number
  icon: Component
}
const pluginCategoryIcons = [
  Search,
  Wrench,
  Code2,
  Calculator,
  BookOpen,
  Image,
  MessagesSquare,
  UsersRound,
  MessageCircle,
  Workflow,
] as const
const appId = computed(() => Number(route.params.appId))
const {
  appDetail,
  appDraft,
  publishedVersions,
  promptContent,
  selectedLlmId,
  capabilities,
  pluginIds,
  pluginSettings,
  knowledgeConfig,
  openingStatementContent,
  openingQuestions,
  settings,
  toggleSettings,
  loading,
  publishing,
  publishedVersionsLoading,
  optimizingPrompt,
  lastSavedAt,
  modelOptions,
  selectedModelLabel,
  autoSaveText,
  loadApp,
  loadPublishedVersions,
  saveDraftNow,
  publishVersion,
  restoreVersion,
  optimizePrompt,
} = useAppOrchestrationDraft(appId)
const {
  debugStore,
  senderValue,
  attachments,
  responding,
  uploadFiles,
  removeAttachment,
  submitMessage: submitDebugMessage,
  stopResponse,
  clearChat,
} = useAppDebugSession(appId, saveDraftNow, settings)
const isPageTab = (page: unknown): page is PageTab => {
  return typeof page === 'string' && pageTabs.some((item) => item.page === page)
}
const activePage = computed<PageTab>(() => {
  const page = route.params.page
  return isPageTab(page) ? page : 'edit'
})
const appName = computed(() => appDetail.value?.name || '聊天机器人')
const appAvatar = computed(() => appDetail.value?.image || '')
const userName = computed(
  () => authStore.userInfo?.profile?.nickname || authStore.userInfo?.username || '用户',
)
const userAvatar = computed(() => authStore.userInfo?.profile?.avatar || '')
const userInitial = computed(() => userName.value.slice(0, 1) || '用')
type ChatRoles = NonNullable<BubbleListProps['roles']>
const chatRoles = computed<ChatRoles>(() => ({
  user: {
    placement: 'end',
    variant: 'filled',
    header: userName.value,
    avatar: createUserAvatar(),
  },
  assistant: {
    placement: 'start',
    variant: 'filled',
    header: appName.value,
    avatar: createAssistantAvatar(),
  },
}))
const suggestedPrompts = computed(() => debugStore.getSuggestions(appId.value))
const selectedPluginIds = computed(() => new Set(pluginIds.value))
const selectedKnowledgeIds = computed(() => new Set(knowledgeConfig.ids))
const openingPresetQuestions = computed(() =>
  openingQuestions.value
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, openingQuestionLimit),
)
const suggestionTargetMessageKey = computed(() => {
  return [...debugStore.getMessages(appId.value)]
    .reverse()
    .find((item) => item.role === 'assistant' && !item.pending && item.content.trim())?.key
})
const displayMessages = computed<ChatMessage[]>(() =>
  debugStore.getMessages(appId.value).map((item) => ({
    ...item,
    footer:
      item.role === 'assistant' && !item.pending && item.elapsedMs !== undefined
        ? createAssistantFooter(
            formatMessageMeta(item.elapsedMs, item.tokens),
            item.key === suggestionTargetMessageKey.value ? suggestedPrompts.value : [],
          )
        : undefined,
  })),
)
const promptOptimizeDisplay = computed(
  () =>
    promptOptimizeResult.value || (optimizingPrompt.value ? '正在生成优化版本...' : '暂无优化结果'),
)
const selectedPlugins = computed<AppVersionPluginItem[]>(() => {
  const pluginLookup = new Map<number, AppVersionPluginItem>()
  for (const item of appDraft.value?.plugins ?? []) {
    pluginLookup.set(item.id, item)
  }
  for (const item of pluginCatalogCache.value) {
    pluginLookup.set(item.id, item)
  }
  return pluginIds.value
    .map((id) => pluginLookup.get(id))
    .filter((item): item is AppVersionPluginItem => item !== undefined)
})
const selectedKnowledges = computed<AppVersionKnowledgeItem[]>(() => {
  const knowledgeLookup = new Map<number, AppVersionKnowledgeItem>()
  for (const item of appDraft.value?.knowledges ?? []) {
    knowledgeLookup.set(item.id, item)
  }
  for (const item of knowledgeCatalogCache.value) {
    knowledgeLookup.set(item.id, item)
  }
  return knowledgeConfig.ids
    .map((id) => knowledgeLookup.get(id))
    .filter((item): item is AppVersionKnowledgeItem => item !== undefined)
})
const pluginCategoryOptions = computed(() =>
  buildPluginCategoryOptions(pluginCategoryCatalog.value),
)
const pluginGroups = computed(() =>
  buildPluginGroups(
    pluginCatalog.value,
    activePluginSourceKey.value === 'custom' ? '自定义插件' : '已发布插件',
  ),
)
const activePluginSourceName = computed(() => {
  if (activePluginSourceKey.value === 'custom') return '自定义插件'
  const category = pluginCategoryOptions.value.find(
    (item) => item.key === activePluginCategoryKey.value,
  )
  return category?.name ?? '全部'
})
const pluginEmptyText = computed(() =>
  activePluginSourceKey.value === 'custom' ? '暂无自定义插件' : '当前分类下没有已发布插件',
)
const knowledgeEmptyText = computed(() =>
  knowledgeCatalogLoading.value ? '正在加载知识库...' : '暂无可引用知识库',
)
function clampSettingValue(value: number | undefined, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : fallback
}

function normalizeKnowledgeRecallSettings(
  settings: AppKnowledgeRecallSettings,
): Required<AppKnowledgeRecallSettings> {
  return {
    strategy: settings.strategy ?? 'hybrid',
    limit: Math.round(clampSettingValue(settings.limit, 1, 20, 5)),
    minScore: clampSettingValue(settings.minScore, 0, 1, 0.4),
  }
}

function buildPluginCategoryOptions(categories: PluginCategoryItem[]): PluginCategoryOption[] {
  return [
    {
      key: allPluginCategoryKey,
      name: '全部',
      sort: -1,
      icon: Database,
    },
    ...categories.map((category, index) => ({
      key: category.key,
      name: category.name,
      sort: category.sort,
      icon: pluginCategoryIcons[index % pluginCategoryIcons.length] ?? Workflow,
    })),
  ].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}

function buildPluginGroups(plugins: PluginItem[], fallbackTitle: string) {
  const groups = new Map<
    string,
    {
      key: string
      title: string
      sort: number
      items: PluginItem[]
    }
  >()

  for (const item of plugins) {
    const category = item.category
    const key = category?.key ?? fallbackTitle
    const title = category?.name ?? fallbackTitle
    const sort = category?.sort ?? 999
    const current = groups.get(key)
    if (current) {
      current.items.push(item)
      continue
    }
    groups.set(key, {
      key,
      title,
      sort,
      items: [item],
    })
  }

  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
function createAssistantFooter(text: string, suggestions: string[] = []) {
  return h('div', { class: 'chat-message-footer' }, [
    h('div', { class: 'chat-message-footer__meta' }, [
      h('span', text),
      h('div', { class: 'chat-message-footer__actions' }, [
        h('button', { class: 'chat-message-footer__button', type: 'button' }, [
          h(Copy, { size: 14 }),
        ]),
        h('button', { class: 'chat-message-footer__button', type: 'button' }, [
          h(Trash2, { size: 14 }),
        ]),
      ]),
    ]),
    suggestions.length
      ? h(Prompts, {
          class: 'chat-message-suggestions',
          items: suggestions.map((item, index) => ({
            key: `${index}-${item}`,
            label: item,
          })),
          vertical: true,
          onItemClick: (info: { data: { label?: unknown } }) => {
            if (typeof info.data.label === 'string') {
              submitSuggestedPrompt(info.data.label)
            }
          },
        })
      : null,
  ])
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(value: number) {
  return `${(value / 1000).toFixed(1)}s`
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`
  if (value >= 10_000) return `${Number((value / 1_000).toFixed(1))}K`
  return value.toLocaleString('en-US')
}

function formatMessageMeta(elapsedMs: number, tokens?: number) {
  const parts = [formatDuration(elapsedMs)]
  if (tokens !== undefined) {
    parts.push(`${formatTokens(tokens)} Tokens`)
  }
  return parts.join(' · ')
}

async function openMemoryModal() {
  if (!toggleSettings.longTermMemory) return
  memoryModalOpen.value = true
  memoryLoading.value = true
  try {
    memoryRecord.value = await getAiAppMemoryApi(appId.value)
    memoryDraft.value = memoryRecord.value.content
  } finally {
    memoryLoading.value = false
  }
}

async function saveMemory() {
  memorySaving.value = true
  try {
    memoryRecord.value = await updateAiAppMemoryApi(appId.value, {
      content: memoryDraft.value,
    })
    memoryDraft.value = memoryRecord.value.content
    memoryModalOpen.value = false
    message.success('长期记忆已保存')
  } finally {
    memorySaving.value = false
  }
}

function createAssistantAvatar() {
  if (appAvatar.value) {
    return h('span', { class: 'chat-avatar chat-avatar--assistant has-image' }, [
      h('img', { src: appAvatar.value, alt: '' }),
    ])
  }

  return h('span', { class: 'chat-avatar chat-avatar--assistant' }, [h(Bot, { size: 16 })])
}

function createUserAvatar() {
  if (userAvatar.value) {
    return h('span', { class: 'chat-avatar chat-avatar--user has-image' }, [
      h('img', { src: userAvatar.value, alt: '' }),
    ])
  }

  return h('span', { class: 'chat-avatar chat-avatar--user' }, userInitial.value)
}

function getCapabilityIcon(item: CapabilityItem) {
  if (item.icon === 'image') return Image
  if (item.icon === 'globe') return Globe2
  return Bot
}

function removeCapability(key: string) {
  capabilities.value = capabilities.value.filter((item) => item.key !== key)
}

function updateModelSettings(nextSettings: typeof settings) {
  Object.assign(settings, nextSettings)
}

async function loadPluginCatalog() {
  const requestId = ++pluginCatalogRequestId
  pluginCatalogLoading.value = true
  try {
    const [categories, plugins] = await Promise.all([
      loadPluginCategories(),
      loadCurrentPluginCatalog(),
    ])
    if (requestId !== pluginCatalogRequestId) return
    pluginCategoryCatalog.value = categories
    pluginCatalog.value = plugins
    mergePluginCatalogCache(plugins)
    if (!pluginCategoryOptions.value.some((item) => item.key === activePluginCategoryKey.value)) {
      activePluginCategoryKey.value = allPluginCategoryKey
    }
  } finally {
    if (requestId === pluginCatalogRequestId) {
      pluginCatalogLoading.value = false
    }
  }
}

function openPluginModal() {
  pluginModalOpen.value = true
  void loadPluginCatalog()
}

function selectPluginSource(key: PluginSourceKey) {
  activePluginSourceKey.value = key
  void loadPluginCatalog()
}

function selectPluginCategory(key: string) {
  activePluginSourceKey.value = 'category'
  activePluginCategoryKey.value = key
  void loadPluginCatalog()
}

function loadPluginCategories() {
  if (pluginCategoryCatalog.value.length) return Promise.resolve(pluginCategoryCatalog.value)
  return listPluginCategoriesApi()
}

async function loadCurrentPluginCatalog() {
  const result = await listPluginsApi({
    page: 1,
    pageSize: 200,
    scope: activePluginSourceKey.value === 'custom' ? 'mine' : 'available',
    ...(activePluginSourceKey.value === 'category' &&
    activePluginCategoryKey.value !== allPluginCategoryKey
      ? { categoryKey: activePluginCategoryKey.value }
      : {}),
  })
  return result.items
}

function mergePluginCatalogCache(items: PluginItem[]) {
  const next = new Map(pluginCatalogCache.value.map((item) => [item.id, item]))
  for (const item of items) {
    next.set(item.id, item)
  }
  pluginCatalogCache.value = [...next.values()]
}

const isPluginItem = (value: AppVersionPluginItem | PluginItem): value is PluginItem => {
  return 'openapiSchema' in value && typeof value.openapiSchema === 'string'
}

async function openPluginSettings(item: AppVersionPluginItem | PluginItem) {
  pluginSettingsOpen.value = true
  pluginSettingsLoading.value = true
  pluginSettingsRecord.value = undefined
  const cached = pluginCatalogCache.value.find((plugin) => plugin.id === item.id)
  if (cached) {
    pluginSettingsRecord.value = cached
    pluginSettingsLoading.value = false
    return
  }
  if (isPluginItem(item)) {
    pluginSettingsRecord.value = item
    mergePluginCatalogCache([item])
    pluginSettingsLoading.value = false
    return
  }

  try {
    const detail = await getPluginApi(item.id)
    pluginSettingsRecord.value = detail
    mergePluginCatalogCache([detail])
  } catch {
    message.error('插件详情获取失败')
    pluginSettingsOpen.value = false
  } finally {
    pluginSettingsLoading.value = false
  }
}

const currentPluginOperationSettings = computed<Record<string, AppPluginOperationSettings>>(() => {
  if (!pluginSettingsRecord.value) return {}
  return pluginSettings.value[String(pluginSettingsRecord.value.id)] ?? {}
})

function updatePluginOperationSettings(
  pluginId: number,
  settings: Record<string, AppPluginOperationSettings>,
) {
  pluginSettings.value = {
    ...pluginSettings.value,
    [String(pluginId)]: settings,
  }
}

function togglePluginSelection(id: number) {
  const next = new Set(pluginIds.value)
  if (next.has(id)) {
    next.delete(id)
    const nextSettings = { ...pluginSettings.value }
    delete nextSettings[String(id)]
    pluginSettings.value = nextSettings
  } else {
    next.add(id)
  }
  pluginIds.value = [...next]
}

function removeSelectedPlugin(id: number) {
  pluginIds.value = pluginIds.value.filter((item) => item !== id)
  const nextSettings = { ...pluginSettings.value }
  delete nextSettings[String(id)]
  pluginSettings.value = nextSettings
}

async function loadKnowledgeCatalog() {
  const requestId = ++knowledgeCatalogRequestId
  knowledgeCatalogLoading.value = true
  try {
    const result = await listKnowledgeApi({ page: 1, pageSize: 200 })
    if (requestId !== knowledgeCatalogRequestId) return
    knowledgeCatalog.value = result.items
    mergeKnowledgeCatalogCache(result.items)
  } finally {
    if (requestId === knowledgeCatalogRequestId) {
      knowledgeCatalogLoading.value = false
    }
  }
}

function mergeKnowledgeCatalogCache(items: KnowledgeItem[]) {
  const next = new Map(knowledgeCatalogCache.value.map((item) => [item.id, item]))
  for (const item of items) {
    next.set(item.id, item)
  }
  knowledgeCatalogCache.value = [...next.values()]
}

function openKnowledgeModal() {
  knowledgeModalOpen.value = true
  void loadKnowledgeCatalog()
}

function toggleKnowledgeSelection(id: number) {
  const next = new Set(knowledgeConfig.ids)
  if (next.has(id)) {
    next.delete(id)
  } else {
    if (next.size >= knowledgeLimit) {
      message.warning(`最多关联 ${knowledgeLimit} 个知识库`)
      return
    }
    next.add(id)
  }
  knowledgeConfig.ids = [...next]
}

function openKnowledgeSettings() {
  knowledgeSettingsDraft.value = normalizeKnowledgeRecallSettings(knowledgeConfig.settings)
  knowledgeSettingsOpen.value = true
}

function confirmKnowledgeSettings() {
  knowledgeConfig.settings = normalizeKnowledgeRecallSettings(knowledgeSettingsDraft.value)
  knowledgeSettingsOpen.value = false
}

function removeSelectedKnowledge(id: number) {
  knowledgeConfig.ids = knowledgeConfig.ids.filter((item) => item !== id)
}

function openPublishHistory() {
  publishHistoryOpen.value = true
  void loadPublishedVersions()
}

function addOpeningQuestion() {
  if (openingQuestions.value.length >= openingQuestionLimit) return
  openingQuestions.value.push('')
}

function removeOpeningQuestion(index: number) {
  openingQuestions.value.splice(index, 1)
  if (openingQuestions.value.length === 0) {
    openingQuestions.value.push('')
  }
}

function submitSuggestedPrompt(content: string) {
  void submitDebugMessage(content, scrollChatToBottom)
}

async function generatePromptOptimization(source: string) {
  promptOptimizeAbortController?.abort()
  const abortController = new AbortController()
  promptOptimizeAbortController = abortController
  promptOptimizeSource.value = source
  promptOptimizeResult.value = ''
  promptOptimizeOpen.value = true

  try {
    await optimizePrompt(
      source,
      (chunk) => {
        promptOptimizeResult.value += chunk
        void nextTick(() => {
          promptOptimizeModalRef.value?.scrollResultToBottom()
        })
      },
      abortController.signal,
    )
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      message.error('优化生成失败，请稍后重试')
    }
    if (
      !promptOptimizeResult.value &&
      !(error instanceof DOMException && error.name === 'AbortError')
    ) {
      promptOptimizeOpen.value = false
    }
  } finally {
    if (promptOptimizeAbortController === abortController) {
      promptOptimizeAbortController = undefined
    }
  }
}

function closePromptOptimize() {
  promptOptimizeAbortController?.abort()
  promptOptimizeOpen.value = false
}

function openPromptOptimize() {
  if (optimizingPrompt.value) return
  if (!selectedLlmId.value) {
    message.error('请先选择模型')
    return
  }
  if (!promptContent.value.trim()) {
    message.error('请先填写人设与回复逻辑')
    return
  }

  void generatePromptOptimization(promptContent.value)
}

function regeneratePromptOptimization() {
  if (optimizingPrompt.value) return
  void generatePromptOptimization(promptOptimizeSource.value)
}

async function applyOptimizedPrompt() {
  if (!promptOptimizeResult.value || optimizingPrompt.value) return

  promptContent.value = promptOptimizeResult.value
  promptOptimizeOpen.value = false
  await nextTick()
  await saveDraftNow()
  message.success('已应用优化版本')
}

async function scrollChatToBottom() {
  await nextTick()
  chatPreviewRef.value?.scrollToBottom()
}

onMounted(() => {
  void authStore.getUserInfo()
  void loadApp()
})
</script>

<template>
  <div class="app-orchestration">
    <AppOrchestrationTopbar
      :tabs="pageTabs"
      :active-page="activePage"
      :app-id="appId"
      :app-name="appName"
      :app-avatar="appAvatar"
      :auto-save-text="autoSaveText"
      :publishing="publishing"
      @open-history="openPublishHistory"
      @publish="publishVersion"
    />

    <Transition name="orchestration-tab" mode="out-in">
      <main v-if="activePage === 'edit'" key="edit" class="app-orchestration__body">
        <PromptEditorPanel
          v-model:model-settings-open="modelSettingsOpen"
          v-model:selected-llm-id="selectedLlmId"
          v-model:prompt-content="promptContent"
          :selected-model-label="selectedModelLabel"
          :model-options="modelOptions"
          :loading="loading"
          :settings="settings"
          :optimizing-prompt="optimizingPrompt"
          @update:settings="updateModelSettings"
          @optimize="openPromptOptimize"
        />

        <section class="app-orchestration__config orchestration-workspace-panel">
          <div class="orchestration-panel__header"><h2>应用能力</h2></div>
          <div class="app-orchestration__config-scroll">
            <div class="config-section">
              <div class="config-section__head">
                <div>
                  <ChevronDown :size="15" />
                  <h3>扩展插件</h3>
                </div>
                <Button type="text" size="small" @click="openPluginModal">
                  <template #icon><Plus :size="16" /></template>
                </Button>
              </div>
              <div v-if="selectedPlugins.length" class="selected-plugin-list">
                <article v-for="item in selectedPlugins" :key="item.id" class="capability-item">
                  <div class="capability-item__icon" :class="{ 'has-image': item.icon }">
                    <img v-if="item.icon" :src="item.icon" alt="" />
                    <Database v-else :size="13" />
                  </div>
                  <div>
                    <h4>{{ item.name }}</h4>
                    <p>{{ item.description || '暂无描述' }}</p>
                  </div>
                  <div class="capability-item__actions">
                    <Button type="text" size="small" @click="openPluginSettings(item)">
                      <template #icon><Settings :size="14" /></template>
                    </Button>
                    <Button type="text" size="small" @click="removeSelectedPlugin(item.id)">
                      <template #icon><Trash2 :size="14" /></template>
                    </Button>
                  </div>
                </article>
              </div>
              <div class="capability-list">
                <article v-for="item in capabilities" :key="item.key" class="capability-item">
                  <div class="capability-item__icon" :style="{ background: item.tone }">
                    <component :is="getCapabilityIcon(item)" :size="18" />
                  </div>
                  <div>
                    <h4>{{ item.title }}</h4>
                    <p>{{ item.description }}</p>
                  </div>
                  <div class="capability-item__actions">
                    <Button type="text" size="small"
                      ><template #icon><Settings :size="14" /></template
                    ></Button>
                    <Button type="text" size="small" @click="removeCapability(item.key)">
                      <template #icon><Trash2 :size="14" /></template>
                    </Button>
                  </div>
                </article>
              </div>
            </div>

            <div class="config-section">
              <div class="config-section__head">
                <div>
                  <ChevronDown :size="15" />
                  <h3>工作流组件</h3>
                </div>
                <Button type="text" size="small"
                  ><template #icon><Plus :size="16" /></template
                ></Button>
              </div>
              <p class="config-section__description">
                工作流支持通过可视化的方式，对插件、大语言模型、代码块等功能进行组合。
              </p>
            </div>

            <div class="config-section">
              <div class="config-section__head">
                <div>
                  <ChevronDown :size="15" />
                  <h3>知识库</h3>
                </div>
                <div class="config-section__actions">
                  <Button type="text" size="small" @click="openKnowledgeSettings">
                    <template #icon><Settings :size="14" /></template>
                  </Button>
                  <Button type="text" size="small" @click="openKnowledgeModal"
                    ><template #icon><Plus :size="16" /></template
                  ></Button>
                </div>
              </div>
              <div v-if="selectedKnowledges.length" class="selected-plugin-list">
                <article v-for="item in selectedKnowledges" :key="item.id" class="capability-item">
                  <div class="capability-item__icon" :class="{ 'has-image': item.icon }">
                    <img v-if="item.icon" :src="item.icon" alt="" />
                    <BookOpen v-else :size="16" />
                  </div>
                  <div>
                    <h4>{{ item.name }}</h4>
                    <p>{{ item.description || '暂无描述' }}</p>
                  </div>
                  <div class="capability-item__actions">
                    <Button type="text" size="small" @click="removeSelectedKnowledge(item.id)">
                      <template #icon><Trash2 :size="14" /></template>
                    </Button>
                  </div>
                </article>
              </div>
            </div>

            <div class="config-section" v-for="item in configToggles" :key="item.key">
              <div class="config-section__head">
                <div>
                  <ChevronDown :size="15" />
                  <h3>{{ item.title }}</h3>
                </div>
                <Switch
                  v-model:checked="toggleSettings[item.key]"
                  checked-children="开启"
                  un-checked-children="关闭"
                />
              </div>
              <p class="config-section__description">{{ item.description }}</p>
            </div>

            <div class="config-section">
              <div class="config-section__head">
                <div>
                  <ChevronDown :size="15" />
                  <h3>对话开场白</h3>
                </div>
                <Button
                  type="text"
                  size="small"
                  :disabled="openingQuestions.length >= openingQuestionLimit"
                  @click="addOpeningQuestion"
                >
                  <template #icon><Plus :size="16" /></template>
                </Button>
              </div>
              <label class="config-section__label">开场白文案 <Info :size="13" /></label>
              <TextArea
                v-model:value="openingStatementContent"
                placeholder="在此处填写 AI 应用的开场白"
                :rows="3"
              />
              <label class="config-section__label">开场白预设问题 <Info :size="13" /></label>
              <div class="opening-question-list">
                <Input
                  v-for="(_, index) in openingQuestions"
                  :key="index"
                  v-model:value="openingQuestions[index]"
                  :maxlength="80"
                  placeholder="输入开场白引导问题"
                >
                  <template #suffix>
                    <Button
                      type="text"
                      size="small"
                      class="opening-question-remove"
                      :disabled="openingQuestions.length <= 1"
                      @click="removeOpeningQuestion(index)"
                    >
                      <template #icon><MinusCircle :size="15" /></template>
                    </Button>
                  </template>
                </Input>
              </div>
            </div>
          </div>
        </section>

        <DebugPreviewPanel
          ref="chatPreviewRef"
          v-model:sender-value="senderValue"
          :app-name="appName"
          :app-avatar="appAvatar"
          :user-name="userName"
          :opening-statement="openingStatementContent"
          :opening-questions="openingPresetQuestions"
          :messages="displayMessages"
          :chat-roles="chatRoles"
          :attachments="attachments"
          :responding="responding"
          :show-memory-button="toggleSettings.longTermMemory"
          @clear-chat="clearChat"
          @open-memory="openMemoryModal"
          @submit-suggested="submitSuggestedPrompt"
          @upload-files="uploadFiles"
          @remove-attachment="removeAttachment"
          @submit-message="(value) => submitDebugMessage(value, scrollChatToBottom)"
          @stop-response="stopResponse"
        />
      </main>

      <PublishConfigView v-else-if="activePage === 'publish'" key="publish" />

      <StatsAnalysisView v-else key="stats" />
    </Transition>

    <ResourceSelectionModals
      v-model:plugin-open="pluginModalOpen"
      v-model:knowledge-open="knowledgeModalOpen"
      :active-plugin-source-key="activePluginSourceKey"
      :active-plugin-category-key="activePluginCategoryKey"
      :plugin-category-options="pluginCategoryOptions"
      :active-plugin-source-name="activePluginSourceName"
      :plugin-catalog-loading="pluginCatalogLoading"
      :plugin-groups="pluginGroups"
      :selected-plugin-ids="selectedPluginIds"
      :plugin-empty-text="pluginEmptyText"
      :knowledge-catalog-loading="knowledgeCatalogLoading"
      :knowledge-catalog="knowledgeCatalog"
      :selected-knowledge-ids="selectedKnowledgeIds"
      :knowledge-empty-text="knowledgeEmptyText"
      @select-plugin-source="selectPluginSource"
      @select-plugin-category="selectPluginCategory"
      @toggle-plugin="togglePluginSelection"
      @toggle-knowledge="toggleKnowledgeSelection"
    />

    <PluginSettingsDrawer
      v-model:open="pluginSettingsOpen"
      :plugin="pluginSettingsRecord"
      :settings="currentPluginOperationSettings"
      :loading="pluginSettingsLoading"
      @save="updatePluginOperationSettings"
    />

    <AppModal
      v-model:open="knowledgeSettingsOpen"
      width="56rem"
      title="检索设置"
      ok-text="确定"
      cancel-text="取消"
      @ok="confirmKnowledgeSettings"
    >
      <div class="recall-settings">
        <div class="recall-settings__row">
          <span>检索策略</span>
          <RadioGroup
            v-model:value="knowledgeSettingsDraft.strategy"
            class="recall-settings__options"
          >
            <Radio value="hybrid">混合检索</Radio>
            <Radio value="vector">向量检索</Radio>
            <Radio value="text">全文检索</Radio>
          </RadioGroup>
        </div>
        <div class="recall-settings__row">
          <span>最大召回数量</span>
          <div class="recall-setting-control">
            <Slider v-model:value="knowledgeSettingsDraft.limit" :min="1" :max="20" :step="1" />
            <InputNumber v-model:value="knowledgeSettingsDraft.limit" :min="1" :max="20" />
          </div>
        </div>
        <div class="recall-settings__row">
          <span>最小匹配度</span>
          <div class="recall-setting-control">
            <Slider
              v-model:value="knowledgeSettingsDraft.minScore"
              :min="0"
              :max="1"
              :step="0.01"
            />
            <InputNumber
              v-model:value="knowledgeSettingsDraft.minScore"
              :min="0"
              :max="1"
              :step="0.01"
            />
          </div>
        </div>
      </div>
    </AppModal>

    <PublishHistoryDrawer
      v-model:open="publishHistoryOpen"
      :app-name="appName"
      :app-avatar="appAvatar"
      :description="appDetail?.description || ''"
      :last-edited-at="lastSavedAt || appDraft?.updatedAt"
      :versions="publishedVersions"
      :loading="publishedVersionsLoading"
      :format-date-time="formatDateTime"
      @restore="restoreVersion"
    />

    <AppModal
      v-model:open="memoryModalOpen"
      width="62rem"
      title="长期记忆"
      ok-text="更新记忆"
      cancel-text="取消"
      :confirm-loading="memorySaving"
      @ok="saveMemory"
    >
      <div class="memory-modal">
        <TextArea
          v-model:value="memoryDraft"
          :rows="8"
          :disabled="memoryLoading"
          placeholder="输入或编辑长期记忆"
        />
      </div>
    </AppModal>

    <PromptOptimizeModal
      ref="promptOptimizeModalRef"
      :open="promptOptimizeOpen"
      :source="promptOptimizeSource"
      :result="promptOptimizeResult"
      :display="promptOptimizeDisplay"
      :optimizing="optimizingPrompt"
      @close="closePromptOptimize"
      @regenerate="regeneratePromptOptimization"
      @apply="applyOptimizedPrompt"
    />
  </div>
</template>

<style scoped lang="scss">
@use './index.scss';
</style>
