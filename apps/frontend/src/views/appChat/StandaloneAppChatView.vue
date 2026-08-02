<script setup lang="ts">
import {
  deleteStandaloneChatSessionApi,
  getStandaloneAiAppApi,
  listStandaloneChatMessagesApi,
  listStandaloneChatSessionsApi,
  pinStandaloneChatSessionApi,
  streamStandaloneAiAppApi,
  transcribeStandaloneAiAppSpeechApi,
  unpinStandaloneChatSessionApi,
  updateStandaloneChatSessionApi,
  type StandaloneAiAppMeta,
  type StandaloneChatMessageItem,
  type StandaloneChatSessionItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import { useAuthStore } from '@/stores/auth'
import {
  Bot,
  Copy,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from '@lucide/vue'
import { Prompts } from 'ant-design-x-vue'
import type { BubbleListProps } from 'ant-design-x-vue'
import { Button, Drawer, Dropdown, Input, Modal, Result, Spin, message } from 'antdv-next'
import type { MenuProps } from 'antdv-next'
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DebugPreviewPanel, { type DebugChatMessage } from '../appOrchestration/DebugPreviewPanel.vue'
import { useAppDebugSession } from '../appOrchestration/useAppDebugSession'

const route = useRoute()
const authStore = useAuthStore()
const appId = computed(() => Number(route.params.appId))
const storeKey = computed(() => -appId.value)
const sessionPageSize = 30
const messagePageSize = 30
const pageScrollClassName = 'standalone-chat-page'
const historyLoadScrollThreshold = 24
const bottomScrollThreshold = 48
const meta = ref<StandaloneAiAppMeta>()
const loading = ref(false)
const sessionsLoading = ref(false)
const sessionsLoadingMore = ref(false)
const historyLoading = ref(false)
const accessError = ref('')
const conversationSessions = ref<StandaloneChatSessionItem[]>([])
const sessionPage = ref(1)
const sessionPages = ref(1)
const messagePage = ref(1)
const messagePages = ref(1)
const renameModalOpen = ref(false)
const renaming = ref(false)
const renameTarget = ref<StandaloneChatSessionItem>()
const renameTitleDraft = ref('')
const mobileSidebarOpen = ref(false)
const appName = computed(() => meta.value?.app.name || '聊天机器人')
const appAvatar = computed(() => meta.value?.app.image || '')
const userName = computed(
  () => authStore.userInfo?.profile?.nickname || authStore.userInfo?.username || '用户',
)
const userAvatar = computed(() => authStore.userInfo?.profile?.avatar || '')
const userInitial = computed(() => userName.value.slice(0, 1) || '用')
const openingStatement = computed(() => meta.value?.openingStatement.content || '')
const openingQuestions = computed(() =>
  (meta.value?.openingStatement.questions ?? []).map((item) => item.trim()).filter(Boolean),
)
const voiceInputEnabled = computed(() => meta.value?.toggles.voiceInput ?? false)
type ChatRoles = NonNullable<BubbleListProps['roles']>
type SessionGroup = {
  key: 'pinned' | 'normal'
  title: string
  sessions: StandaloneChatSessionItem[]
}
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
const {
  debugStore: sessionStore,
  senderValue,
  attachments,
  responding,
  transcribingVoice,
  uploadFiles,
  removeAttachment,
  submitMessage,
  submitVoiceMessage,
  stopResponse,
} = useAppDebugSession(appId, async () => undefined, {
  streamApi: streamStandaloneAiAppApi,
  transcribeApi: transcribeStandaloneAiAppSpeechApi,
  storeKey,
  voiceOutputEnabled: () => meta.value?.toggles.voiceOutput ?? false,
  onSession: () => {
    void loadSessions(true)
  },
})
const suggestedPrompts = computed(() => sessionStore.getSuggestions(storeKey.value))
const suggestionTargetMessageKey = computed(() => {
  return [...sessionStore.getMessages(storeKey.value)]
    .reverse()
    .find((item) => item.role === 'assistant' && !item.pending && item.content.trim())?.key
})
const displayMessages = computed<DebugChatMessage[]>(() =>
  sessionStore.getMessages(storeKey.value).map((item) => ({
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
const activeSessionId = computed(() => sessionStore.getSessionId(storeKey.value))
const sessionGroups = computed<SessionGroup[]>(() => {
  const pinned = conversationSessions.value.filter((item) => item.pinnedAt)
  const normal = conversationSessions.value.filter((item) => !item.pinnedAt)

  return [
    pinned.length ? { key: 'pinned', title: '置顶', sessions: pinned } : undefined,
    { key: 'normal', title: '对话列表', sessions: normal },
  ].filter((item): item is SessionGroup => Boolean(item))
})
const hasMoreSessions = computed(() => sessionPage.value < sessionPages.value)
const hasMoreHistory = computed(
  () => Boolean(activeSessionId.value) && messagePage.value < messagePages.value,
)
const chatTitle = computed(() => {
  const activeSession = conversationSessions.value.find((item) => item.id === activeSessionId.value)
  return activeSession?.title || '新对话'
})

const SessionDirectory = defineComponent({
  name: 'StandaloneChatSessionDirectory',
  props: {
    rootClass: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h('div', { class: props.rootClass }, [
        h('div', { class: 'standalone-chat__brand' }, [
          h(
            'div',
            { class: ['standalone-chat__app-icon', { 'has-image': Boolean(appAvatar.value) }] },
            [appAvatar.value ? h('img', { src: appAvatar.value, alt: '' }) : h(Bot, { size: 18 })],
          ),
          h('strong', appName.value),
        ]),
        h(
          Button,
          {
            type: 'primary',
            block: true,
            class: 'standalone-chat__new',
            disabled: responding.value,
            onClick: startNewChat,
          },
          {
            icon: () => h(MessageSquarePlus, { size: 15 }),
            default: () => '新建对话',
          },
        ),
        h(
          'section',
          {
            class: 'standalone-chat__menu standalone-chat__menu--grow',
            onScroll: handleSessionListScroll,
          },
          createSessionDirectoryContent(),
        ),
      ])
  },
})

function createSessionDirectoryContent() {
  if (sessionsLoading.value && !conversationSessions.value.length) {
    return [h('div', { class: 'standalone-chat__empty-list' }, '正在加载对话...')]
  }
  if (!conversationSessions.value.length) {
    return [h('div', { class: 'standalone-chat__empty-list' }, '暂无对话')]
  }

  const nodes = sessionGroups.value.flatMap((group) => [
    h('span', { key: `${group.key}-title` }, group.title),
    ...group.sessions.map((session) =>
      h(
        'div',
        {
          key: session.id,
          class: [
            'standalone-chat__session',
            { 'is-active': activeSessionId.value === session.id },
          ],
        },
        [
          h(
            'button',
            {
              type: 'button',
              class: 'standalone-chat__session-main',
              onClick: () => openSession(session.id),
            },
            [h('strong', session.title)],
          ),
          h(
            Dropdown,
            {
              trigger: ['click'],
              menu: { items: getSessionMenuItems(session) },
              onClick: (event: Event) => event.stopPropagation(),
              onMenuClick: (event: { key: string | number }) =>
                handleSessionMenuClick(event, session),
            },
            {
              default: () =>
                h(
                  Button,
                  {
                    type: 'text',
                    shape: 'circle',
                    size: 'small',
                    class: 'standalone-chat__session-action',
                    title: '更多操作',
                    'aria-label': '更多操作',
                  },
                  { icon: () => h(MoreHorizontal, { size: 14 }) },
                ),
            },
          ),
        ],
      ),
    ),
  ])

  if (sessionsLoadingMore.value) {
    nodes.push(h('div', { class: 'standalone-chat__empty-list' }, '加载更多对话...'))
  }
  return nodes
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

async function scrollChatToBottom(force = true) {
  await nextTick()
  const scrollElement = document.scrollingElement ?? document.documentElement
  const distanceToBottom = scrollElement.scrollHeight - window.scrollY - window.innerHeight
  if (!force && distanceToBottom > bottomScrollThreshold) return
  window.scrollTo(0, scrollElement.scrollHeight)
}

function submitSuggestedPrompt(content: string) {
  void submitStandaloneMessage(content)
}

function startNewChat() {
  if (responding.value) return
  sessionStore.clearMessages(storeKey.value)
  resetComposerState()
  resetMessagePaging()
  mobileSidebarOpen.value = false
}

function resetComposerState() {
  senderValue.value = ''
  attachments.value = []
}

function resetMessagePaging() {
  messagePage.value = 1
  messagePages.value = 1
}

function getSessionMenuItems(session: StandaloneChatSessionItem): MenuProps['items'] {
  const deletingActiveResponse = responding.value && activeSessionId.value === session.id

  return [
    {
      key: 'pin',
      icon: session.pinnedAt ? h(PinOff, { size: 14 }) : h(Pin, { size: 14 }),
      label: session.pinnedAt ? '取消置顶' : '置顶',
    },
    {
      key: 'rename',
      icon: h(Pencil, { size: 14 }),
      label: '重命名',
    },
    {
      key: 'delete',
      icon: h(Trash2, { size: 14 }),
      label: '删除',
      danger: true,
      disabled: deletingActiveResponse,
    },
  ]
}

function mergeSessions(items: StandaloneChatSessionItem[]) {
  const sessionMap = new Map<number, StandaloneChatSessionItem>()
  const nextSessions = [...conversationSessions.value, ...items]
  nextSessions.forEach((item) => {
    sessionMap.set(item.id, item)
  })
  return Array.from(sessionMap.values())
}

function openRenameModal(session: StandaloneChatSessionItem) {
  renameTarget.value = session
  renameTitleDraft.value = session.title
  renameModalOpen.value = true
}

async function confirmRenameSession() {
  const session = renameTarget.value
  const title = renameTitleDraft.value.trim()
  if (!session || !title) return

  renaming.value = true
  try {
    const updated = await updateStandaloneChatSessionApi(appId.value, session.id, { title })
    conversationSessions.value = conversationSessions.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    renameModalOpen.value = false
    message.success('会话已重命名')
  } finally {
    renaming.value = false
  }
}

function confirmDeleteSession(session: StandaloneChatSessionItem) {
  Modal.confirm({
    title: '删除对话',
    content: `确定删除“${session.title}”吗？删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    async onOk() {
      await deleteStandaloneChatSessionApi(appId.value, session.id)
      conversationSessions.value = conversationSessions.value.filter(
        (item) => item.id !== session.id,
      )
      if (activeSessionId.value === session.id) {
        sessionStore.clearMessages(storeKey.value)
        resetComposerState()
        resetMessagePaging()
      }
      message.success('会话已删除')
      void loadSessions(true)
    },
  })
}

async function togglePinSession(session: StandaloneChatSessionItem) {
  if (session.pinnedAt) {
    await unpinStandaloneChatSessionApi(appId.value, session.id)
    message.success('已取消置顶')
  } else {
    await pinStandaloneChatSessionApi(appId.value, session.id)
    message.success('已置顶')
  }
  await loadSessions(true)
}

function handleSessionMenuClick(
  event: { key: string | number },
  session: StandaloneChatSessionItem,
) {
  const key = String(event.key)
  if (key === 'pin') {
    void togglePinSession(session)
  } else if (key === 'rename') {
    openRenameModal(session)
  } else if (key === 'delete') {
    confirmDeleteSession(session)
  }
}

function toDebugMessage(item: StandaloneChatMessageItem) {
  return {
    key: `${item.role === 'assistant' ? 'a' : 'u'}-${item.id}`,
    id: item.id,
    role: item.role,
    content: item.content,
    attachments: item.attachments ?? [],
    pending: false,
    elapsedMs: item.elapsedMs ?? undefined,
    tokens: item.tokens ?? undefined,
  }
}

async function loadSessions(reset = false) {
  if (!Number.isFinite(appId.value)) return
  if (reset) {
    sessionPage.value = 1
    sessionPages.value = 1
  } else if (sessionsLoadingMore.value || sessionsLoading.value || !hasMoreSessions.value) {
    return
  }

  const page = reset ? 1 : sessionPage.value + 1
  const loadingRef = reset ? sessionsLoading : sessionsLoadingMore
  loadingRef.value = true
  try {
    const result = await listStandaloneChatSessionsApi(appId.value, {
      page,
      pageSize: sessionPageSize,
    })
    sessionPage.value = result.page
    sessionPages.value = result.pages || 1
    conversationSessions.value = reset ? result.items : mergeSessions(result.items)
  } finally {
    loadingRef.value = false
  }
}

function handleSessionListScroll(event: Event) {
  const element = event.currentTarget
  if (!(element instanceof HTMLElement)) return
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
  if (remaining <= 32) void loadSessions(false)
}

function handleDocumentScroll() {
  if (window.scrollY <= historyLoadScrollThreshold) void loadMoreHistory()
}

async function openSession(sessionId: number) {
  if (responding.value || activeSessionId.value === sessionId) return
  historyLoading.value = true
  try {
    const result = await listStandaloneChatMessagesApi(appId.value, sessionId, {
      page: 1,
      pageSize: messagePageSize,
    })
    sessionStore.setSessionId(storeKey.value, sessionId)
    sessionStore.setSuggestions(storeKey.value, [])
    sessionStore.setMessages(storeKey.value, result.items.map(toDebugMessage))
    messagePage.value = result.page
    messagePages.value = result.pages || 1
    resetComposerState()
    mobileSidebarOpen.value = false
    await scrollChatToBottom()
  } finally {
    historyLoading.value = false
  }
}

async function loadMoreHistory() {
  const sessionId = activeSessionId.value
  if (!sessionId || historyLoading.value || !hasMoreHistory.value) return

  historyLoading.value = true
  const scrollElement = document.scrollingElement ?? document.documentElement
  const previousScroll = {
    scrollTop: window.scrollY,
    scrollHeight: scrollElement.scrollHeight,
  }
  try {
    const result = await listStandaloneChatMessagesApi(appId.value, sessionId, {
      page: messagePage.value + 1,
      pageSize: messagePageSize,
    })
    const currentMessages = sessionStore.getMessages(storeKey.value)
    const currentIds = new Set(currentMessages.map((item) => item.id).filter(Boolean))
    const olderMessages = result.items
      .map(toDebugMessage)
      .filter((item) => !item.id || !currentIds.has(item.id))
    sessionStore.setMessages(storeKey.value, [...olderMessages, ...currentMessages])
    messagePage.value = result.page
    messagePages.value = result.pages || 1
    await nextTick()
    const heightDelta = scrollElement.scrollHeight - previousScroll.scrollHeight
    window.scrollTo(0, previousScroll.scrollTop + heightDelta)
  } finally {
    historyLoading.value = false
  }
}

async function submitStandaloneMessage(value: string) {
  await submitMessage(value, scrollChatToBottom)
}

function getPageScrollModeElements() {
  return [document.documentElement, document.body, document.getElementById('app')].filter(
    (element): element is HTMLElement => Boolean(element),
  )
}

function setPageScrollMode(enabled: boolean) {
  getPageScrollModeElements().forEach((element) => {
    element.classList.toggle(pageScrollClassName, enabled)
  })
}

async function loadApp() {
  loading.value = true
  accessError.value = ''
  try {
    meta.value = await getStandaloneAiAppApi(appId.value, { suppressErrorNotify: true })
    await loadSessions(true)
  } catch (error) {
    const apiError = error as { response?: { status?: number; data?: { message?: string } } }
    accessError.value =
      apiError.response?.status === 403
        ? '无权访问该应用'
        : apiError.response?.data?.message || '独立对话页不可用'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  setPageScrollMode(true)
  window.addEventListener('scroll', handleDocumentScroll, { passive: true })
  await authStore.getUserInfo()
  await loadApp()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleDocumentScroll)
  setPageScrollMode(false)
})
</script>

<template>
  <div class="standalone-chat">
    <Spin :spinning="loading">
      <Result
        v-if="accessError"
        status="403"
        :title="accessError"
        sub-title="请确认应用已公开，或使用创建者账号访问。"
      />
      <main v-else class="standalone-chat__shell">
        <SessionDirectory root-class="standalone-chat__sidebar" />

        <header class="standalone-chat__mobile-topbar">
          <Button
            type="text"
            shape="circle"
            class="standalone-chat__mobile-menu"
            title="打开目录"
            aria-label="打开目录"
            @click="mobileSidebarOpen = true"
          >
            <template #icon><Menu :size="18" /></template>
          </Button>
          <div class="standalone-chat__mobile-title">
            <span>{{ appName }}</span>
            <strong>{{ chatTitle }}</strong>
          </div>
          <Button
            type="text"
            shape="circle"
            class="standalone-chat__mobile-new"
            :disabled="responding"
            title="新建对话"
            aria-label="新建对话"
            @click="startNewChat"
          >
            <template #icon><MessageSquarePlus :size="18" /></template>
          </Button>
        </header>

        <DebugPreviewPanel
          v-model:sender-value="senderValue"
          :title="chatTitle"
          :composer-placeholder="`给“${appName}”发送消息`"
          :app-name="appName"
          :app-avatar="appAvatar"
          :user-name="userName"
          :opening-statement="openingStatement"
          :opening-questions="openingQuestions"
          :messages="displayMessages"
          :chat-roles="chatRoles"
          :attachments="attachments"
          :responding="responding"
          :show-clear-button="false"
          :show-memory-button="false"
          :voice-input-enabled="voiceInputEnabled"
          :transcribing-voice="transcribingVoice"
          :history-loading="historyLoading"
          :has-more-history="hasMoreHistory"
          @submit-suggested="submitSuggestedPrompt"
          @upload-files="uploadFiles"
          @remove-attachment="removeAttachment"
          @submit-message="submitStandaloneMessage"
          @submit-voice="(file) => submitVoiceMessage(file, scrollChatToBottom)"
          @toggle-audio-text="(key) => sessionStore.toggleAudioText(storeKey, key)"
          @stop-response="stopResponse"
          @load-more-history="loadMoreHistory"
        />
      </main>

      <Drawer
        v-model:open="mobileSidebarOpen"
        title="对话目录"
        placement="left"
        :size="320"
        :closable="{ placement: 'end' }"
        class="standalone-chat__drawer"
      >
        <SessionDirectory root-class="standalone-chat__drawer-body" />
      </Drawer>

      <AppModal
        v-model:open="renameModalOpen"
        title="重命名对话"
        width="42rem"
        ok-text="保存"
        cancel-text="取消"
        :confirm-loading="renaming"
        @ok="confirmRenameSession"
      >
        <Input
          v-model:value="renameTitleDraft"
          :maxlength="120"
          placeholder="请输入对话名称"
          @press-enter="confirmRenameSession"
        />
      </AppModal>
    </Spin>
  </div>
</template>

<style scoped lang="scss">
.standalone-chat,
.standalone-chat *,
.standalone-chat *::before,
.standalone-chat *::after {
  box-sizing: border-box;
}

.standalone-chat {
  --color-primary: var(--primary-color);
  --color-text: var(--font-color);
  --color-text-strong: var(--font-active-color);
  --color-text-muted: var(--font-light-color);
  --color-text-subtle: #9ca3af;
  --color-bg-panel: var(--white);
  --color-bg-soft: var(--touch-bg);
  --color-border-light: var(--border-color);
  --color-border: #d1d5db;
  --color-white: var(--white);
  --color-success: #0f766e;
  --radius-sm: 0.6rem;
  --radius-md: 0.8rem;
  --space-1: 0.4rem;
  --space-2: 0.8rem;
  --space-3: 1.2rem;
  --space-4: 1.6rem;
  --chat-sidebar-width: 24rem;
  --chat-header-height: 6.4rem;
  --chat-mobile-topbar-height: 5.6rem;
  --chat-composer-reserve: 13rem;
  --chat-content-max-width: 112rem;
  --font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;

  width: 100%;
  min-height: 100dvh;
  color: var(--color-text);
  background: var(--white);
  font-family: var(--font-family);
}

.standalone-chat :deep(.ant-spin-nested-loading),
.standalone-chat :deep(.ant-spin-container) {
  width: 100%;
  min-height: 100%;
}

.standalone-chat__shell {
  display: grid;
  grid-template-columns: var(--chat-sidebar-width) minmax(0, 1fr);
  width: 100%;
  min-height: 100dvh;
  align-items: start;
}

.standalone-chat__sidebar {
  display: flex;
  min-width: 0;
  height: 100dvh;
  position: sticky;
  top: 0;
  flex-direction: column;
  gap: 1.8rem;
  padding: 1.8rem 1.4rem;
  background: #fafafa;
  border-right: 0.1rem solid var(--border-color);
}

.standalone-chat__mobile-topbar {
  display: none;
}

.standalone-chat__mobile-title {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.2rem;
  text-align: center;
}

.standalone-chat__mobile-title span,
.standalone-chat__mobile-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standalone-chat__mobile-title span {
  color: var(--font-light-color);
  font-size: 1.1rem;
  line-height: 1.4rem;
}

.standalone-chat__mobile-title strong {
  color: var(--font-active-color);
  font-size: 1.4rem;
  line-height: 1.8rem;
}

.standalone-chat__drawer-body {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 1.6rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__brand),
.standalone-chat__drawer-body :deep(.standalone-chat__brand) {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 1rem;
  font-size: 1.5rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__brand strong),
.standalone-chat__sidebar :deep(.standalone-chat__menu strong),
.standalone-chat__drawer-body :deep(.standalone-chat__brand strong),
.standalone-chat__drawer-body :deep(.standalone-chat__menu strong) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standalone-chat__sidebar :deep(.standalone-chat__app-icon),
.standalone-chat__drawer-body :deep(.standalone-chat__app-icon) {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  color: var(--white);
  background: var(--primary-color);
  border-radius: 0.8rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__app-icon.has-image),
.standalone-chat__drawer-body :deep(.standalone-chat__app-icon.has-image) {
  background: var(--background-hover-color);
}

.standalone-chat__sidebar :deep(.standalone-chat__app-icon img),
.standalone-chat__drawer-body :deep(.standalone-chat__app-icon img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.standalone-chat__sidebar :deep(.standalone-chat__new),
.standalone-chat__drawer-body :deep(.standalone-chat__new) {
  min-height: 3.6rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__menu),
.standalone-chat__drawer-body :deep(.standalone-chat__menu) {
  display: grid;
  gap: 0.8rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__menu--grow),
.standalone-chat__drawer-body :deep(.standalone-chat__menu--grow) {
  min-height: 0;
  overflow-y: auto;
}

.standalone-chat__sidebar :deep(.standalone-chat__menu > span),
.standalone-chat__drawer-body :deep(.standalone-chat__menu > span) {
  color: var(--font-light-color);
  font-size: 1.3rem;
  line-height: 1.8rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__empty-list),
.standalone-chat__drawer-body :deep(.standalone-chat__empty-list) {
  padding: 0.6rem 0.9rem;
  color: var(--font-light-color);
  font-size: 1.3rem;
  line-height: 1.8rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__session),
.standalone-chat__drawer-body :deep(.standalone-chat__session) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.8rem;
  align-items: center;
  min-height: 3.2rem;
  overflow: hidden;
  border-radius: 0.6rem;
}

.standalone-chat__sidebar :deep(.standalone-chat__session-main),
.standalone-chat__drawer-body :deep(.standalone-chat__session-main) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  min-height: 3.2rem;
  padding: 0 0.4rem 0 0.9rem;
  color: var(--font-color);
  font: inherit;
  font-size: 1.3rem;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.standalone-chat__sidebar :deep(.standalone-chat__session-action),
.standalone-chat__drawer-body :deep(.standalone-chat__session-action) {
  opacity: 0;
}

.standalone-chat__sidebar :deep(.standalone-chat__session.is-active),
.standalone-chat__sidebar :deep(.standalone-chat__session:hover),
.standalone-chat__drawer-body :deep(.standalone-chat__session.is-active),
.standalone-chat__drawer-body :deep(.standalone-chat__session:hover) {
  color: var(--primary-color);
  background: var(--background-hover-color);
}

.standalone-chat__sidebar :deep(.standalone-chat__session.is-active .standalone-chat__session-main),
.standalone-chat__sidebar :deep(.standalone-chat__session:hover .standalone-chat__session-main),
.standalone-chat__drawer-body
  :deep(.standalone-chat__session.is-active .standalone-chat__session-main),
.standalone-chat__drawer-body
  :deep(.standalone-chat__session:hover .standalone-chat__session-main) {
  color: var(--primary-color);
}

.standalone-chat__sidebar :deep(.standalone-chat__session:hover .standalone-chat__session-action),
.standalone-chat__sidebar
  :deep(.standalone-chat__session.is-active .standalone-chat__session-action),
.standalone-chat__drawer-body
  :deep(.standalone-chat__session:hover .standalone-chat__session-action),
.standalone-chat__drawer-body
  :deep(.standalone-chat__session.is-active .standalone-chat__session-action) {
  opacity: 1;
}

.standalone-chat__drawer-body :deep(.standalone-chat__session-action) {
  opacity: 1;
}

.standalone-chat :deep(.app-orchestration__preview) {
  display: block;
  min-width: 0;
  min-height: 100dvh;
}

.standalone-chat :deep(.orchestration-panel__header) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--color-bg-panel);
}

.standalone-chat :deep(.chat-preview) {
  width: 100%;
  max-width: var(--chat-content-max-width);
  min-height: calc(100dvh - var(--chat-header-height));
  margin: 0 auto;
  overflow: visible;
  padding-bottom: var(--chat-composer-reserve);
}

.standalone-chat :deep(.chat-preview__opening-questions button) {
  display: inline-flex;
  align-items: center;
  min-height: 3.6rem;
  padding: 0.7rem var(--space-3);
  color: var(--color-text);
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 0.1rem 0.2rem rgba(17, 24, 39, 0.04);
}

.standalone-chat :deep(.chat-preview__opening-questions button:hover),
.standalone-chat :deep(.chat-preview__opening-questions button:focus-visible) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.standalone-chat :deep(.chat-composer) {
  position: fixed;
  right: 0;
  bottom: 0;
  left: var(--chat-sidebar-width);
  z-index: 2;
  padding-right: 2.4rem;
  padding-left: 2.4rem;
  background: var(--color-bg-panel);
}

.standalone-chat :deep(.chat-composer > .composer-row),
.standalone-chat :deep(.chat-composer > p) {
  max-width: var(--chat-content-max-width);
  margin-right: auto;
  margin-left: auto;
}

:global(html.standalone-chat-page) {
  height: auto;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

:global(body.standalone-chat-page),
:global(#app.standalone-chat-page) {
  height: auto;
  min-height: 100%;
  overflow: visible;
}

@media (max-width: 760px) {
  .standalone-chat__shell {
    grid-template-columns: 1fr;
  }

  .standalone-chat__sidebar {
    display: none;
  }

  .standalone-chat__mobile-topbar {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 3;
    align-items: center;
    min-width: 0;
    height: var(--chat-mobile-topbar-height);
    gap: 0.8rem;
    padding: 0.8rem 1.2rem;
    background: var(--color-bg-panel);
    border-bottom: 0.1rem solid var(--color-border-light);
  }

  .standalone-chat__mobile-menu,
  .standalone-chat__mobile-new {
    flex: 0 0 auto;
  }

  .standalone-chat :deep(.app-orchestration__preview) {
    min-height: calc(100dvh - var(--chat-mobile-topbar-height));
  }

  .standalone-chat :deep(.orchestration-panel__header) {
    display: none;
  }

  .standalone-chat :deep(.chat-preview) {
    min-height: max(42rem, calc(100dvh - 18rem));
    padding-top: 2rem;
    padding-bottom: var(--chat-composer-reserve);
  }

  .standalone-chat :deep(.chat-preview__empty) {
    min-height: min(48rem, calc(100dvh - 22rem));
  }

  .standalone-chat :deep(.chat-composer) {
    left: 0;
    padding-right: 1.6rem;
    padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
    padding-left: 1.6rem;
  }

  .standalone-chat :deep(.chat-composer p) {
    margin-top: 0.6rem;
    font-size: 1.1rem;
    line-height: 1.6rem;
  }
}
</style>
