<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { listPluginsApi, type AppVersionPluginItem, type PluginItem } from '@/api'
import { renderMarkdown } from '@/utils/markdown'
import {
  BadgeDollarSign,
  BookOpen,
  Bot,
  BotMessageSquare,
  Calculator,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CircleEqual,
  CircleHelp,
  CircleStop,
  CircleX,
  Clock3,
  Copy,
  Database,
  Globe2,
  History,
  Hourglass,
  Image,
  Info,
  MessagesSquare,
  MinusCircle,
  PanelTop,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Trash2,
  User,
  UsersRound,
  Workflow,
  X,
} from '@lucide/vue'
import { Bubble, Prompts, Sender } from 'ant-design-x-vue'
import type { BubbleListProps } from 'ant-design-x-vue'
import {
  Button,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Popover,
  Select,
  Slider,
  Switch,
  Tag,
  TextArea,
  message,
} from 'antdv-next'
import { computed, h, nextTick, onMounted, ref, type VNode } from 'vue'
import { useRoute } from 'vue-router'
import {
  configToggles,
  openingQuestionLimit,
  useAppOrchestrationDraft,
  type CapabilityItem,
} from './useAppOrchestrationDraft'
import { useAppDebugSession } from './useAppDebugSession'

type ChatMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  footer?: VNode
  pending?: boolean
}

const route = useRoute()
const authStore = useAuthStore()
const modelSettingsOpen = ref(false)
const pluginModalOpen = ref(false)
const publishHistoryOpen = ref(false)
const promptOptimizeOpen = ref(false)
const promptOptimizeSource = ref('')
const promptOptimizeResult = ref('')
const chatListRef = ref<HTMLElement>()
const promptOptimizeResultRef = ref<HTMLElement>()
const myPluginCatalog = ref<PluginItem[]>([])
const publishedPluginCatalog = ref<PluginItem[]>([])
const pluginCatalogLoading = ref(false)
const activePluginSourceKey = ref<PluginSourceKey>('custom')
const activePluginCategoryKey = ref('all')
let promptOptimizeAbortController: AbortController | undefined
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
  count: number
}
const appId = computed(() => Number(route.params.appId))
const {
  appDetail,
  appDraft,
  publishedVersions,
  promptContent,
  selectedLlmId,
  capabilities,
  pluginIds,
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
  responding,
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
  for (const item of myPluginCatalog.value) {
    pluginLookup.set(item.id, item)
  }
  for (const item of publishedPluginCatalog.value) {
    pluginLookup.set(item.id, item)
  }
  return pluginIds.value
    .map((id) => pluginLookup.get(id))
    .filter((item): item is AppVersionPluginItem => item !== undefined)
})
const pluginCategoryOptions = computed(() =>
  buildPluginCategoryOptions(publishedPluginCatalog.value),
)
const visiblePluginCatalog = computed(() => {
  if (activePluginSourceKey.value === 'custom') return myPluginCatalog.value

  return publishedPluginCatalog.value.filter((item) => {
    const categoryKey = item.category?.key || 'uncategorized'
    return activePluginCategoryKey.value === 'all' || categoryKey === activePluginCategoryKey.value
  })
})
const pluginGroups = computed(() => buildPluginGroups(visiblePluginCatalog.value))
const activePluginSourceName = computed(() =>
  activePluginSourceKey.value === 'custom' ? '自定义插件' : '已发布插件',
)
const pluginEmptyText = computed(() =>
  activePluginSourceKey.value === 'custom' ? '暂无自定义插件' : '当前分类下没有已发布插件',
)
function buildPluginCategoryOptions(plugins: PluginItem[]): PluginCategoryOption[] {
  const categories = new Map<string, PluginCategoryOption>()

  for (const item of plugins) {
    const category = item.category
    const key = category?.key || 'uncategorized'
    const name = category?.name || '未分类'
    const sort = category?.sort ?? 999
    const current = categories.get(key)
    categories.set(key, {
      key,
      name,
      sort,
      count: (current?.count ?? 0) + 1,
    })
  }

  return [
    { key: 'all', name: '全部', sort: -1, count: plugins.length },
    ...[...categories.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  ]
}

function buildPluginGroups(plugins: PluginItem[]) {
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
    const key = category?.key || 'uncategorized'
    const title = category?.name || '未分类'
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
const publishChannels = [
  {
    key: 'web',
    title: '网页版',
    description: '可通过访问PC网页立即开始对话。',
    icon: PanelTop,
    tone: '#e0f2fe',
    status: 'configured',
    action: 'visit',
    link: 'https://www.llmops-imooc.com/web-app/WNFEKnzu',
  },
  {
    key: 'wechat',
    title: '微信公众号（订阅号、服务号）',
    description: '接入微信公众号，自动回复用户消息，助力高效私域运营',
    icon: MessagesSquare,
    tone: '#dcfce7',
    status: 'unconfigured',
    action: 'configure',
  },
  {
    key: 'feishu',
    title: '飞书（Bot群聊机器人）',
    description: '在飞书中直接 @Bot 对话，提高工作生产力',
    icon: Send,
    tone: '#e0f2fe',
    status: 'unconfigured',
    action: 'configure',
  },
]
const chartRange = '过去7天'
const chartDescription = '展示最近7天的会话数'
const overviewMetrics = [
  {
    key: 'sessions',
    label: '全部会话数',
    value: '1,354',
    unit: '次',
    change: '0%',
    icon: BotMessageSquare,
  },
  {
    key: 'active-users',
    label: '活跃用户数',
    value: '1,012',
    unit: '人',
    change: '17.5%',
    icon: UsersRound,
  },
  {
    key: 'interactions',
    label: '平均会话互动数',
    value: '12',
    unit: '次',
    change: '34.1%',
    icon: Hourglass,
  },
  {
    key: 'token-speed',
    label: 'Token输出速度',
    value: '14.7',
    unit: '次',
    change: '34.1%',
    icon: Calculator,
  },
  {
    key: 'cost',
    label: '费用消耗',
    value: '14.78',
    unit: '元',
    change: '34.1%',
    icon: BadgeDollarSign,
  },
]
const detailMetrics = [
  { key: 'sessions', title: '全部会话数' },
  { key: 'active-users', title: '活跃用户数' },
  { key: 'interactions', title: '平均会话互动数' },
  { key: 'cost', title: '费用消耗' },
]

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
  return value.toLocaleString('en-US')
}

function formatMessageMeta(elapsedMs: number, tokens?: number) {
  const parts = [formatDuration(elapsedMs)]
  if (tokens !== undefined) {
    parts.push(`${formatTokens(tokens)} Tokens`)
  }
  return parts.join(' · ')
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

function getPluginCategoryIcon(key: string) {
  if (key === 'all') return Database
  if (key === 'uncategorized') return BookOpen
  return Workflow
}

function removeCapability(key: string) {
  capabilities.value = capabilities.value.filter((item) => item.key !== key)
}

async function loadPluginCatalog() {
  pluginCatalogLoading.value = true
  try {
    const [mineResult, availableResult] = await Promise.all([
      listPluginsApi({
        page: 1,
        pageSize: 200,
        scope: 'mine',
      }),
      listPluginsApi({
        page: 1,
        pageSize: 200,
        scope: 'available',
      }),
    ])
    myPluginCatalog.value = mineResult.items
    publishedPluginCatalog.value = availableResult.items
    if (
      activePluginCategoryKey.value !== 'all' &&
      !pluginCategoryOptions.value.some((item) => item.key === activePluginCategoryKey.value)
    ) {
      activePluginCategoryKey.value = 'all'
    }
  } finally {
    pluginCatalogLoading.value = false
  }
}

function openPluginModal() {
  pluginModalOpen.value = true
  void loadPluginCatalog()
}

function selectPluginSource(key: PluginSourceKey) {
  activePluginSourceKey.value = key
}

function selectPluginCategory(key: string) {
  activePluginSourceKey.value = 'category'
  activePluginCategoryKey.value = key
}

function togglePluginSelection(id: number) {
  const next = new Set(pluginIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  pluginIds.value = [...next]
}

function removeSelectedPlugin(id: number) {
  pluginIds.value = pluginIds.value.filter((item) => item !== id)
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
          if (promptOptimizeResultRef.value) {
            promptOptimizeResultRef.value.scrollTop = promptOptimizeResultRef.value.scrollHeight
          }
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
  if (chatListRef.value) {
    chatListRef.value.scrollTop = chatListRef.value.scrollHeight
  }
}

onMounted(() => {
  void authStore.getUserInfo()
  void loadApp()
})
</script>

<template>
  <div class="app-orchestration">
    <header class="workspace-topbar">
      <div class="workspace-topbar__entity">
        <div class="workspace-topbar__logo" :class="{ 'has-image': appAvatar }">
          <img v-if="appAvatar" :src="appAvatar" alt="" />
          <Bot v-else :size="18" />
        </div>
        <div class="workspace-topbar__identity">
          <div>
            <h1>{{ appName }}</h1>
            <Copy :size="14" />
          </div>
          <p>
            <User :size="13" />
            <span>个人空间</span>
            <Clock3 :size="13" />
            <span>草稿</span>
            <Tag color="processing">{{ autoSaveText }}</Tag>
          </p>
        </div>
      </div>

      <div class="workspace-topbar__center">
        <nav class="app-orchestration__tabs" role="tablist" aria-label="应用编排页面">
          <RouterLink
            v-for="tab in pageTabs"
            :key="tab.page"
            v-slot="{ href, navigate }"
            :to="{
              name: 'app-orchestration',
              params: { appId: route.params.appId, page: tab.page },
            }"
            custom
          >
            <a
              class="app-orchestration__tab"
              :class="{ 'is-active': activePage === tab.page }"
              :href="href"
              role="tab"
              :aria-selected="activePage === tab.page"
              @click="navigate"
            >
              {{ tab.label }}
            </a>
          </RouterLink>
        </nav>
      </div>

      <div class="workspace-topbar__actions">
        <Button shape="circle" aria-label="历史版本" @click="openPublishHistory">
          <template #icon><History :size="18" /></template>
        </Button>
        <div class="publish-action">
          <Button
            class="publish-action__main"
            type="primary"
            :loading="publishing"
            @click="publishVersion"
          >
            保存版本
          </Button>
          <Button class="publish-action__toggle" type="primary" aria-label="发布操作">
            <ChevronDown :size="14" />
          </Button>
        </div>
      </div>
    </header>

    <Transition name="orchestration-tab" mode="out-in">
      <main v-if="activePage === 'edit'" key="edit" class="app-orchestration__body">
        <section class="app-orchestration__prompt orchestration-workspace-panel">
          <div class="orchestration-panel__header">
            <div class="app-orchestration__title-row">
              <h2>应用编排</h2>
              <Popover
                v-model:open="modelSettingsOpen"
                trigger="click"
                placement="bottomLeft"
                force-render
              >
                <button class="app-orchestration__model-trigger" type="button">
                  <Bot :size="14" />
                  <span>{{ selectedModelLabel }}</span>
                  <ChevronDown :size="14" />
                </button>
                <template #content>
                  <section class="model-settings">
                    <h3>模型设置</h3>
                    <label class="model-settings__field">
                      <span>模型</span>
                      <Select
                        v-model:value="selectedLlmId"
                        :options="modelOptions"
                        :loading="loading"
                        allow-clear
                        placeholder="请选择模型"
                      />
                    </label>
                    <div class="model-settings__group">
                      <span>参数</span>
                      <label class="model-settings__row">
                        <span>温度</span>
                        <Slider
                          v-model:value="settings.temperature"
                          :min="0"
                          :max="2"
                          :step="0.01"
                        />
                        <div class="model-settings__number">
                          <InputNumber
                            v-model:value="settings.temperature"
                            :min="0"
                            :max="2"
                            :step="0.01"
                          />
                        </div>
                      </label>
                      <label class="model-settings__row">
                        <span>Top P</span>
                        <Slider v-model:value="settings.topP" :min="0" :max="1" :step="0.01" />
                        <div class="model-settings__number">
                          <InputNumber
                            v-model:value="settings.topP"
                            :min="0"
                            :max="1"
                            :step="0.01"
                          />
                        </div>
                      </label>
                      <label class="model-settings__row">
                        <span>存在惩罚</span>
                        <Slider
                          v-model:value="settings.presencePenalty"
                          :min="0"
                          :max="2"
                          :step="0.01"
                        />
                        <div class="model-settings__number">
                          <InputNumber
                            v-model:value="settings.presencePenalty"
                            :min="0"
                            :max="2"
                            :step="0.01"
                          />
                        </div>
                      </label>
                      <label class="model-settings__row">
                        <span>频率惩罚</span>
                        <Slider
                          v-model:value="settings.frequencyPenalty"
                          :min="0"
                          :max="2"
                          :step="0.01"
                        />
                        <div class="model-settings__number">
                          <InputNumber
                            v-model:value="settings.frequencyPenalty"
                            :min="0"
                            :max="2"
                            :step="0.01"
                          />
                        </div>
                      </label>
                    </div>
                    <div class="model-settings__group">
                      <span>输入和输出设置</span>
                      <label class="model-settings__row">
                        <span>携带上下文轮数</span>
                        <Slider
                          v-model:value="settings.contextRounds"
                          :min="1"
                          :max="100"
                          :step="1"
                        />
                        <div class="model-settings__number">
                          <InputNumber
                            v-model:value="settings.contextRounds"
                            :min="1"
                            :max="100"
                            :step="1"
                            :precision="0"
                          />
                        </div>
                      </label>
                    </div>
                  </section>
                </template>
              </Popover>
            </div>
          </div>
          <div class="app-orchestration__prompt-content">
            <div class="app-orchestration__prompt-heading">
              <h3>人设与回复逻辑</h3>
              <Button
                type="text"
                size="small"
                :loading="optimizingPrompt"
                @click="openPromptOptimize"
              >
                <template #icon><RefreshCw :size="15" /></template>
                优化
              </Button>
            </div>
            <TextArea
              v-model:value="promptContent"
              class="app-orchestration__prompt-editor"
              placeholder="描述 AI 应用的角色定位、任务范围和回复规则"
            />
          </div>
        </section>

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
                    <Button type="text" size="small">
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
                <Button type="text" size="small"
                  ><template #icon><Plus :size="16" /></template
                ></Button>
              </div>
              <p class="config-section__description">
                引用文本类型的数据，实现知识问答，应用最多支持关联 5 个知识库。
              </p>
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

        <section class="app-orchestration__preview orchestration-workspace-panel">
          <div class="orchestration-panel__header preview-header">
            <h2>预览与调试</h2>
            <div class="preview-header__actions">
              <Button type="text" size="small" @click="clearChat">
                <template #icon><Trash2 :size="15" /></template>
                清空对话
              </Button>
              <Button type="link" size="small" @click="openPublishHistory">
                <template #icon><Save :size="15" /></template>
                长期记忆
              </Button>
            </div>
          </div>
          <div ref="chatListRef" class="chat-preview">
            <div v-if="displayMessages.length === 0" class="chat-preview__empty">
              <div class="chat-preview__empty-avatar" :class="{ 'has-image': appAvatar }">
                <img v-if="appAvatar" :src="appAvatar" alt="" />
                <Bot v-else :size="24" />
              </div>
              <strong>{{ appName }}</strong>
              <p v-if="openingStatementContent.trim()" class="chat-preview__opening">
                {{ openingStatementContent }}
              </p>
              <div v-if="openingPresetQuestions.length" class="chat-preview__opening-questions">
                <button
                  v-for="question in openingPresetQuestions"
                  :key="question"
                  type="button"
                  @click="submitSuggestedPrompt(question)"
                >
                  {{ question }}
                </button>
              </div>
            </div>
            <Bubble.List v-else :items="displayMessages" :roles="chatRoles">
              <template #message="{ item }">
                <div
                  class="chat-markdown"
                  v-html="renderMarkdown(item.content || (item.pending ? '...' : ''))"
                ></div>
              </template>
            </Bubble.List>
          </div>
          <Button v-if="responding" class="stop-button" @click="stopResponse">
            <template #icon><CircleStop :size="14" /></template>
            停止响应
          </Button>
          <footer class="chat-composer">
            <div class="composer-row">
              <Sender
                v-model:value="senderValue"
                :placeholder="responding ? '正在生成回复...' : '输入调试消息...'"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                class="app-chat-composer"
                @submit="(value) => submitDebugMessage(value, scrollChatToBottom)"
              >
                <template #prefix>
                  <Button type="text" shape="circle">
                    <template #icon><Paperclip :size="16" /></template>
                  </Button>
                </template>
                <template #actions>
                  <Button
                    type="text"
                    shape="circle"
                    @click="submitDebugMessage(senderValue, scrollChatToBottom)"
                  >
                    <template #icon><Send :size="16" /></template>
                  </Button>
                </template>
              </Sender>
            </div>
            <p>内容由AI生成，无法确保真实准确，仅供参考。</p>
          </footer>
        </section>
      </main>

      <main v-else-if="activePage === 'publish'" key="publish" class="publish-config">
        <div class="publish-config__notice">
          如应用访问链接或二维码意外泄露，请及时重新生成或进行停止分发，避免资源出现异常消耗
        </div>

        <div class="publish-config__table" role="table" aria-label="发布配置">
          <div class="publish-config__head" role="row">
            <span role="columnheader">发布渠道</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">操作</span>
          </div>

          <article
            v-for="channel in publishChannels"
            :key="channel.key"
            class="publish-config__row"
            role="row"
          >
            <div class="publish-config__channel" role="cell">
              <div class="publish-config__icon" :style="{ background: channel.tone }">
                <component :is="channel.icon" :size="18" />
              </div>
              <div>
                <strong>{{ channel.title }}</strong>
                <span>{{ channel.description }}</span>
              </div>
            </div>

            <div class="publish-config__status" role="cell">
              <Tag v-if="channel.status === 'configured'" color="processing">
                <template #icon><CircleCheck :size="13" /></template>
                已发布
              </Tag>
              <Tag v-else>
                <template #icon><CircleX :size="13" /></template>
                未配置
              </Tag>
            </div>

            <div class="publish-config__operation" role="cell">
              <template v-if="channel.action === 'visit'">
                <Input class="publish-config__link" :value="channel.link" readonly />
                <Button type="primary">重新生成</Button>
                <Button>立即访问</Button>
              </template>
              <Button v-else type="primary">
                <template #icon><CircleDot :size="15" /></template>
                立即配置
              </Button>
            </div>
          </article>
        </div>
      </main>

      <main v-else key="stats" class="stats-analysis">
        <section class="stats-analysis__section">
          <h2>概览指标 <span>(过去7天)</span></h2>

          <div class="stats-overview">
            <article v-for="metric in overviewMetrics" :key="metric.key" class="stats-card">
              <div class="stats-card__title">
                <span class="stats-card__icon">
                  <component :is="metric.icon" :size="16" />
                </span>
                <span>{{ metric.label }}</span>
                <CircleHelp :size="14" />
              </div>

              <div class="stats-card__value">
                <strong>{{ metric.value }}</strong>
                <span>{{ metric.unit }}</span>
                <em>环比</em>
                <span class="stats-card__change">
                  <CircleEqual :size="13" />
                  {{ metric.change }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section class="stats-analysis__section">
          <h2>详细指标</h2>

          <div class="stats-detail">
            <article v-for="metric in detailMetrics" :key="metric.key" class="stats-chart">
              <header>
                <h3>
                  {{ metric.title }}
                  <CircleHelp :size="14" />
                </h3>
                <span>{{ chartRange }}</span>
              </header>

              <div class="stats-chart__placeholder">
                <span>折线图图表</span>
                <span>{{ chartDescription }}</span>
              </div>
            </article>
          </div>
        </section>
      </main>
    </Transition>

    <Teleport to="body">
      <Transition name="side-modal">
        <div v-if="pluginModalOpen" class="plugin-modal-mask" @click.self="pluginModalOpen = false">
          <div
            class="plugin-modal side-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pluginModalTitle"
          >
            <aside class="plugin-modal__sidebar">
              <h2 id="pluginModalTitle">选择插件</h2>
              <Button type="primary" block>
                <template #icon><Plus :size="15" /></template>
                创建自定义插件
              </Button>

              <div class="plugin-modal__nav">
                <button
                  class="plugin-modal__nav-item"
                  :class="{ 'is-active': activePluginSourceKey === 'custom' }"
                  type="button"
                  @click="selectPluginSource('custom')"
                >
                  <Database :size="15" />
                  <span>自定义插件</span>
                </button>
              </div>

              <div class="plugin-modal__category-title">类别</div>
              <div class="plugin-modal__nav">
                <button
                  v-for="category in pluginCategoryOptions"
                  :key="category.key"
                  class="plugin-modal__nav-item"
                  :class="{
                    'is-active':
                      activePluginSourceKey === 'category' &&
                      activePluginCategoryKey === category.key,
                  }"
                  type="button"
                  @click="selectPluginCategory(category.key)"
                >
                  <component :is="getPluginCategoryIcon(category.key)" :size="15" />
                  <span>{{ category.name }}</span>
                </button>
              </div>
            </aside>

            <section class="plugin-modal__content">
              <div class="plugin-modal__header">
                <h3>{{ activePluginSourceName }}</h3>
                <button
                  class="side-modal__close"
                  type="button"
                  aria-label="关闭"
                  @click="pluginModalOpen = false"
                >
                  <X :size="18" />
                </button>
              </div>

              <div class="plugin-modal__list">
                <div v-if="pluginCatalogLoading">正在加载插件...</div>
                <div v-else-if="pluginGroups.length === 0">{{ pluginEmptyText }}</div>
                <section v-for="group in pluginGroups" :key="group.key" class="plugin-modal__group">
                  <h4>{{ group.title }}</h4>
                  <article
                    v-for="item in group.items"
                    :key="item.id"
                    class="plugin-modal__item"
                    :class="{ 'is-selected': selectedPluginIds.has(item.id) }"
                  >
                    <div class="plugin-modal__item-icon" :class="{ 'has-image': item.icon }">
                      <img v-if="item.icon" :src="item.icon" alt="" />
                      <Database v-else :size="18" />
                    </div>
                    <strong>{{ item.name }}</strong>
                    <Button
                      class="plugin-modal__add"
                      size="small"
                      :type="selectedPluginIds.has(item.id) ? 'default' : 'primary'"
                      @click="togglePluginSelection(item.id)"
                    >
                      <template #icon>
                        <CircleCheck v-if="selectedPluginIds.has(item.id)" :size="14" />
                        <Plus v-else :size="14" />
                      </template>
                      {{ selectedPluginIds.has(item.id) ? '移除' : '添加' }}
                    </Button>
                  </article>
                </section>
              </div>
            </section>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Drawer
      v-model:open="publishHistoryOpen"
      title="历史版本"
      placement="right"
      :size="420"
      :closable="{ placement: 'end' }"
    >
      <div class="publish-history">
        <div class="publish-history__app">
          <div class="publish-history__icon" :class="{ 'has-image': appAvatar }">
            <img v-if="appAvatar" :src="appAvatar" alt="" />
            <Bot v-else :size="18" />
          </div>
          <div>
            <strong>{{ appName }}</strong>
            <span>最近编辑：{{ formatDateTime(lastSavedAt || appDraft?.updatedAt) }}</span>
          </div>
        </div>
        <p class="publish-history__description">
          {{ appDetail?.description || '暂无应用描述' }}
        </p>
        <p class="publish-history__count">共计 {{ publishedVersions.length }} 条发布记录</p>
        <div class="publish-history__list">
          <div v-if="publishedVersionsLoading">正在加载历史版本...</div>
          <article
            v-else
            v-for="(item, index) in publishedVersions"
            :key="item.id"
            class="publish-history__item"
          >
            <div class="publish-history__item-main">
              <div>
                <strong>版本</strong>
                <Tag>{{ item.version }}</Tag>
                <Tag v-if="index === 0">当前版本</Tag>
              </div>
              <span>发布时间: {{ formatDateTime(item.publishedAt || item.createdAt) }}</span>
            </div>
            <Button size="small" :disabled="index === 0" @click="restoreVersion(item.id)">
              <template #icon><RotateCcw :size="13" /></template>
              回退
            </Button>
          </article>
        </div>
      </div>
    </Drawer>

    <Modal
      v-model:open="promptOptimizeOpen"
      width="108rem"
      title="优化人设与回复逻辑"
      :footer="null"
      wrap-class-name="prompt-optimize-modal"
      @cancel="closePromptOptimize"
    >
      <div class="prompt-optimize">
        <section class="prompt-optimize__panel">
          <header>
            <h3>当前版本</h3>
            <Tag>原文</Tag>
          </header>
          <pre>{{ promptOptimizeSource }}</pre>
        </section>

        <section class="prompt-optimize__panel">
          <header>
            <h3>优化版本</h3>
            <Tag v-if="optimizingPrompt" color="processing">生成中</Tag>
            <Tag v-else-if="promptOptimizeResult" color="success">可应用</Tag>
          </header>
          <pre
            ref="promptOptimizeResultRef"
            :class="{ 'is-empty': !promptOptimizeResult && optimizingPrompt }"
            >{{ promptOptimizeDisplay }}</pre
          >
        </section>
      </div>

      <footer class="prompt-optimize__actions">
        <Button @click="closePromptOptimize">取消</Button>
        <div class="prompt-optimize__primary-actions">
          <Button :loading="optimizingPrompt" @click="regeneratePromptOptimization"
            >重新生成</Button
          >
          <Button
            type="primary"
            :disabled="!promptOptimizeResult || optimizingPrompt"
            @click="applyOptimizedPrompt"
          >
            应用
          </Button>
        </div>
      </footer>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use './index.scss';
</style>
