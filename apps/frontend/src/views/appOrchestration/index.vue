<script setup lang="ts">
import { getAiAppApi, type AiAppItem } from '@/api'
import { useAuthStore } from '@/stores/auth'
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
  Square,
  Trash2,
  User,
  UsersRound,
  Workflow,
  X,
} from '@lucide/vue'
import { Bubble, Prompts, Sender } from 'ant-design-x-vue'
import type { BubbleListProps, PromptsProps } from 'ant-design-x-vue'
import {
  Button,
  Drawer,
  Input,
  InputNumber,
  Popover,
  Select,
  Slider,
  Switch,
  Tag,
  TextArea,
  message,
} from 'antdv-next'
import { computed, h, nextTick, onMounted, reactive, ref, type VNode } from 'vue'
import { useRoute } from 'vue-router'

type CapabilityItem = {
  key: string
  title: string
  description: string
  icon: string
  tone: string
}

type ChatMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  footer?: VNode
  pending?: boolean
}

const route = useRoute()
const authStore = useAuthStore()
const appDetail = ref<AiAppItem>()
const promptContent = ref(`# 角色
你是一个智能聊天机器人，能够与用户进行各种话题的交流，包括但不限于生活、工作、学习、娱乐等。

## 技能
### 技能 1: 日常交流
1. 当用户分享日常生活经历时，给予积极的回应和适当的建议。
2. 对于用户的心情表达，提供安慰和鼓励。

### 技能 2: 知识解答
1. 当用户提出问题，运用知识库和搜索工具提供准确、详细的答案。
2. 对于复杂问题，分步骤进行解释。

### 技能 3: 娱乐互动
1. 能与用户玩文字游戏，如猜谜语、成语接龙等。
2. 推荐有趣的娱乐活动和节目。

## 限制:
- 回答内容应积极、友善、文明，不得包含不当言论。
- 所输出的内容必须按照给定的格式进行组织，不能偏离框架要求。
- 对于不确定的问题，应明确告知用户并尽力提供获取准确信息的途径。`)
const selectedModel = ref('gpt-4o')
const modelSettingsOpen = ref(false)
const pluginModalOpen = ref(false)
const publishHistoryOpen = ref(false)
const senderValue = ref('')
const responding = ref(false)
const chatListRef = ref<HTMLElement>()
const messages = ref<ChatMessage[]>([
  { key: 'u1', role: 'user', content: '你好，你是？' },
  {
    key: 'a1',
    role: 'assistant',
    content: '你好呀，我是ChatGPT，很高兴和您交流！',
    footer: createAssistantFooter('1.7s · 72 Tokens'),
  },
  { key: 'u2', role: 'user', content: '能详细讲解下LLM是什么吗？' },
  {
    key: 'a2',
    role: 'assistant',
    content:
      'LLM 即 Large Language Model，大语言模型，是一种基于深度学习的自然语言处理模型，具备较强的语言理解和生成能力，能够处理文本生成、问答、翻译、摘要等任务。',
    footer: createAssistantFooter('1.7s · 1,085 Tokens'),
  },
])
const capabilities = ref<CapabilityItem[]>([
  {
    key: 'imgUnderstand',
    title: '图片理解 / imgUnderstand',
    description: '回答用户关于图像的问题',
    icon: 'image',
    tone: '#fff7ed',
  },
  {
    key: 'bingWebSearch',
    title: '必应搜索 / bingWebSearch',
    description: '必应搜索引擎。当你需要搜索未知信息，比如天气、汇率、时事时使用。',
    icon: 'globe',
    tone: '#ecfeff',
  },
])
const settings = reactive({
  temperature: 1,
  topP: 0.48,
  presencePenalty: 0.1,
  frequencyPenalty: 0.1,
})

const modelOptions = [
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'DeepSeek Chat', value: 'deepseek-chat' },
  { label: 'Moonshot Kimi K2', value: 'kimi-k2' },
]
const pageTabs = [
  { page: 'edit', label: '编辑' },
  { page: 'publish', label: '发布配置' },
  { page: 'stats', label: '统计分析' },
] as const
type PageTab = (typeof pageTabs)[number]['page']
const configToggles = [
  {
    key: 'longTermMemory',
    title: '长期记忆',
    description: '总结聊天对话的内容，并用于更好的响应用户的消息。',
  },
  {
    key: 'questionSuggestions',
    title: '用户问题建议',
    description: '在应用回复后，自动根据对话内容提供 3 条用户提问建议。',
  },
  {
    key: 'voiceInput',
    title: '语音输入',
    description: '启用后，您可以使用语音输入。',
  },
  {
    key: 'voiceOutput',
    title: '语音输出',
    description: '启用后，应用会将文本回复转换为语音输出。',
  },
] as const
const toggleSettings = reactive<Record<(typeof configToggles)[number]['key'], boolean>>({
  longTermMemory: true,
  questionSuggestions: true,
  voiceInput: true,
  voiceOutput: false,
})
const appId = computed(() => Number(route.params.appId))
const isPageTab = (page: unknown): page is PageTab => {
  return typeof page === 'string' && pageTabs.some((item) => item.page === page)
}
const activePage = computed<PageTab>(() => {
  const page = route.params.page
  return isPageTab(page) ? page : 'edit'
})
const appName = computed(() => appDetail.value?.name || '聊天机器人')
const appAvatar = computed(() => appDetail.value?.image || '')
const selectedModelLabel = computed(
  () =>
    modelOptions.find((item) => item.value === selectedModel.value)?.label || selectedModel.value,
)
const userName = computed(
  () => authStore.userInfo?.profile?.nickname || authStore.userInfo?.username || '慕小课',
)
const userInitial = computed(() => userName.value.slice(0, 1) || '用')
type ChatRoles = NonNullable<BubbleListProps['roles']>
const chatRoles = computed<ChatRoles>(() => ({
  user: {
    placement: 'end',
    variant: 'filled',
    header: userName.value,
    avatar: h('span', { class: 'chat-avatar chat-avatar--user' }, userInitial.value),
  },
  assistant: {
    placement: 'start',
    variant: 'filled',
    header: appName.value,
    avatar: createAssistantAvatar(),
  },
}))
const quickPrompts = [
  { key: 'scenario', label: 'LLM 大语言模型有什么应用场景？' },
  { key: 'open-source', label: '有哪些开源的LLM模型？' },
  { key: 'agent', label: 'LLM与Agent之间的关系是什么？' },
]
const pluginGroups = [
  {
    title: 'Google',
    items: [
      '谷歌搜索',
      'DuckDuckGo AI聊天',
      'DuckDuckGo 图片搜索',
      'DuckDuckGo 搜索',
      'DuckDuckGo 翻译',
    ],
  },
  {
    title: 'SerperApi',
    items: ['Google Serper API', 'Google Jobs API', 'Google News API', 'YouTube 脚本 API'],
  },
]
const versions = [
  { no: '#009', current: true, time: '2024-08-15 17:54' },
  { no: '#008', current: false, time: '2024-08-14 11:41' },
  { no: '#007', current: false, time: '2024-08-14 08:34' },
  { no: '#006', current: false, time: '2024-08-11 23:11' },
]
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

function createAssistantFooter(text: string) {
  return h('div', { class: 'chat-message-footer' }, [
    h('span', text),
    h('div', { class: 'chat-message-footer__actions' }, [
      h('button', { class: 'chat-message-footer__button', type: 'button' }, [
        h(Copy, { size: 14 }),
      ]),
      h('button', { class: 'chat-message-footer__button', type: 'button' }, [
        h(Trash2, { size: 14 }),
      ]),
    ]),
  ])
}

function createAssistantAvatar() {
  if (appAvatar.value) {
    return h('span', { class: 'chat-avatar chat-avatar--assistant has-image' }, [
      h('img', { src: appAvatar.value, alt: '' }),
    ])
  }

  return h('span', { class: 'chat-avatar chat-avatar--assistant' }, [h(Bot, { size: 16 })])
}

function getCapabilityIcon(item: CapabilityItem) {
  if (item.icon === 'image') return Image
  if (item.icon === 'globe') return Globe2
  return Bot
}

function addCapability(name: string) {
  const key = name.replace(/\s+/g, '-')
  if (capabilities.value.some((item) => item.key === key)) {
    message.info('插件已添加')
    return
  }
  capabilities.value.push({
    key,
    title: name,
    description: '内置插件能力',
    icon: 'globe',
    tone: '#eff6ff',
  })
  message.success('插件已添加')
}

function removeCapability(key: string) {
  capabilities.value = capabilities.value.filter((item) => item.key !== key)
}

type PromptClickInfo = Parameters<NonNullable<PromptsProps['onItemClick']>>[0]

function handlePromptClick(info: PromptClickInfo) {
  if (typeof info.data.label === 'string') {
    void submitMessage(info.data.label)
  }
}

async function submitMessage(value: string) {
  const content = value.trim()
  if (!content || responding.value) return

  const key = Date.now()
  messages.value.push({
    key: `u-${key}`,
    role: 'user',
    content,
  })
  messages.value.push({
    key: `a-${key}`,
    role: 'assistant',
    content: '正在思考...',
    pending: true,
  })
  senderValue.value = ''
  responding.value = true
  await scrollChatToBottom()

  window.setTimeout(async () => {
    const target = messages.value.find((item) => item.key === `a-${key}`)
    if (target) {
      target.content =
        '这是一个前端调试预览回复。后续接入调试接口后，可以在这里替换为流式生成内容，并展示工具调用、知识库检索和 Token 统计。'
      target.pending = false
      target.footer = createAssistantFooter('1.2s · 128 Tokens')
    }
    responding.value = false
    await scrollChatToBottom()
  }, 700)
}

function stopResponse() {
  responding.value = false
  const last = [...messages.value].reverse().find((item) => item.pending)
  if (last) {
    last.pending = false
    last.content = '已停止响应'
    last.footer = createAssistantFooter('已停止')
  }
}

function clearChat() {
  messages.value = []
}

async function scrollChatToBottom() {
  await nextTick()
  if (chatListRef.value) {
    chatListRef.value.scrollTop = chatListRef.value.scrollHeight
  }
}

async function loadApp() {
  if (!Number.isFinite(appId.value)) return
  try {
    appDetail.value = await getAiAppApi(appId.value)
  } catch {
    message.warning('应用详情加载失败，已使用默认内容')
  }
}

onMounted(() => {
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
            <Tag color="processing">已自动保存 23:18:15</Tag>
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
        <Button shape="circle" aria-label="历史版本" @click="publishHistoryOpen = true">
          <template #icon><History :size="18" /></template>
        </Button>
        <div class="publish-action">
          <Button class="publish-action__main" type="primary">保存版本</Button>
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
                      <Select v-model:value="selectedModel" :options="modelOptions" />
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
                  </section>
                </template>
              </Popover>
            </div>
          </div>
          <div class="app-orchestration__prompt-content">
            <div class="app-orchestration__prompt-heading">
              <h3>人设与回复逻辑</h3>
              <Button type="text" size="small">
                <template #icon><RefreshCw :size="15" /></template>
                优化
              </Button>
            </div>
            <TextArea v-model:value="promptContent" class="app-orchestration__prompt-editor" />
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
                <Button type="text" size="small" @click="pluginModalOpen = true">
                  <template #icon><Plus :size="16" /></template>
                </Button>
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
                <Button type="text" size="small"
                  ><template #icon><Plus :size="16" /></template
                ></Button>
              </div>
              <label class="config-section__label">开场白文案 <Info :size="13" /></label>
              <TextArea placeholder="在此处填写 AI 应用的开场白" :rows="3" />
              <label class="config-section__label">开场白预设问题 <Info :size="13" /></label>
              <Input placeholder="输入开场白引导问题">
                <template #suffix><MinusCircle :size="15" /></template>
              </Input>
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
              <Button type="link" size="small" @click="publishHistoryOpen = true">
                <template #icon><Save :size="15" /></template>
                长期记忆
              </Button>
            </div>
          </div>
          <div ref="chatListRef" class="chat-preview">
            <Bubble.List :items="messages" :roles="chatRoles">
              <template #message="{ item }">
                <span>{{ item.content }}</span>
              </template>
            </Bubble.List>
            <Prompts
              class="chat-preview__prompts"
              :items="quickPrompts"
              vertical
              @item-click="handlePromptClick"
            />
            <Button v-if="responding" class="stop-button" @click="stopResponse">
              <template #icon><Square :size="14" /></template>
              停止响应
            </Button>
          </div>
          <footer class="chat-composer">
            <div class="composer-row">
              <Sender
                v-model:value="senderValue"
                :placeholder="responding ? '正在生成回复...' : '输入调试消息...'"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                class="app-chat-composer"
                @submit="submitMessage"
              >
                <template #prefix>
                  <Button type="text" shape="circle">
                    <template #icon><Paperclip :size="16" /></template>
                  </Button>
                </template>
                <template #actions>
                  <Button type="text" shape="circle" @click="submitMessage(senderValue)">
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
              <h2 id="pluginModalTitle">添加插件</h2>
              <Button type="primary" block>
                <template #icon><Plus :size="15" /></template>
                创建自定义插件
              </Button>

              <div class="plugin-modal__nav">
                <button class="plugin-modal__nav-item" type="button">
                  <Database :size="15" />
                  <span>自定义插件</span>
                </button>
                <button class="plugin-modal__nav-item is-active" type="button">
                  <Globe2 :size="15" />
                  <span>内置</span>
                </button>
              </div>

              <div class="plugin-modal__category-title">类别</div>
              <div class="plugin-modal__nav">
                <button class="plugin-modal__nav-item is-active" type="button">
                  <Database :size="15" />
                  <span>全部</span>
                </button>
                <button class="plugin-modal__nav-item" type="button">
                  <Globe2 :size="15" />
                  <span>搜索</span>
                </button>
                <button class="plugin-modal__nav-item" type="button">
                  <BookOpen :size="15" />
                  <span>天气</span>
                </button>
                <button class="plugin-modal__nav-item" type="button">
                  <Workflow :size="15" />
                  <span>旅行</span>
                </button>
              </div>
            </aside>

            <section class="plugin-modal__content">
              <div class="plugin-modal__header">
                <h3>内置插件</h3>
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
                <section
                  v-for="group in pluginGroups"
                  :key="group.title"
                  class="plugin-modal__group"
                >
                  <h4>{{ group.title }}</h4>
                  <article v-for="name in group.items" :key="name" class="plugin-modal__item">
                    <div class="plugin-modal__item-icon">
                      <Globe2 :size="18" />
                    </div>
                    <strong>{{ name }}</strong>
                    <Button class="plugin-modal__add" size="small" @click="addCapability(name)">
                      <template #icon><Plus :size="14" /></template>
                      添加
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
          <div class="publish-history__icon">
            <img v-if="appAvatar" :src="appAvatar" alt="" />
            <Bot v-else :size="18" />
          </div>
          <div>
            <strong>{{ appName }}</strong>
            <span>最近编辑：2024-08-15 17:54</span>
          </div>
        </div>
        <p class="publish-history__description">
          采用最智能的大模型，自动化AI编程。精通多种编程语言。
        </p>
        <p class="publish-history__count">共计 26 条发布记录</p>
        <div class="publish-history__list">
          <article v-for="item in versions" :key="item.no" class="publish-history__item">
            <div class="publish-history__item-main">
              <div>
                <strong>版本</strong>
                <Tag>{{ item.no }}</Tag>
                <Tag v-if="item.current">当前版本</Tag>
              </div>
              <span>发布时间: {{ item.time }}</span>
            </div>
            <Button size="small" :disabled="item.current">
              <template #icon><RotateCcw :size="13" /></template>
              回退
            </Button>
          </article>
        </div>
      </div>
    </Drawer>
  </div>
</template>

<style scoped lang="scss">
@use './index.scss';
</style>
