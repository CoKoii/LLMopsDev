<script setup lang="ts">
import backgroundUrl from '@/assets/images/background.png'
import logoUrl from '@/assets/images/logo.png'
import { useAuthStore } from '@/stores/auth'
import { Bot } from '@lucide/vue'
import type { BubbleListProps } from 'ant-design-x-vue'
import { computed, h, nextTick, onMounted, ref } from 'vue'
import DebugPreviewPanel, { type DebugChatMessage } from '../appOrchestration/DebugPreviewPanel.vue'
import { useHomeBuilder } from './useHomeBuilder'

const authStore = useAuthStore()
const previewRef = ref<InstanceType<typeof DebugPreviewPanel>>()
const { input, loading, messages, sendMessage, stopResponse } = useHomeBuilder()

const appName = 'AI 应用构建器'
const appAvatar = logoUrl
const backgroundStyle = {
  backgroundImage: `url(${backgroundUrl})`,
}
const openingStatement =
  '你好，欢迎来到 LLMOps。你可以直接说想创建什么智能体、插件或知识库工作流，我会先分析目标，再帮你生成可执行方案。'
const userName = computed(
  () => authStore.userInfo?.profile?.nickname || authStore.userInfo?.username || '用户',
)
const userInitial = computed(() => userName.value.slice(0, 1) || '用')
const userAvatar = computed(() => authStore.userInfo?.profile?.avatar || '')
const openingQuestions = [
  '我想做一个销售跟进智能体',
  '帮我创建一个企业知识库问答应用',
  '我有一个接口，帮我做成插件',
]
const chatRoles = computed<NonNullable<BubbleListProps['roles']>>(() => ({
  user: {
    placement: 'end',
    variant: 'filled',
    header: userName.value,
    avatar: createUserAvatar(),
  },
  assistant: {
    placement: 'start',
    variant: 'filled',
    header: appName,
    avatar: createAssistantAvatar(),
  },
}))
const displayMessages = computed<DebugChatMessage[]>(() =>
  messages.value.map((item) => ({
    key: item.id,
    role: item.role,
    content: item.content,
    pending: item.pending,
    statusText: item.statusText,
  })),
)

function scrollToBottom(force = true) {
  return previewRef.value?.scrollToBottom(force)
}

onMounted(async () => {
  if (messages.value.length) {
    await nextTick()
    await scrollToBottom(true)
  }
})

function submitMessage(value: string) {
  void sendMessage(scrollToBottom, value)
}

function submitSuggestedPrompt(value: string) {
  void sendMessage(scrollToBottom, value)
}

function createAssistantAvatar() {
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
</script>

<template>
  <main class="home-builder" :style="backgroundStyle">
    <DebugPreviewPanel
      ref="previewRef"
      v-model:sender-value="input"
      title="主页"
      composer-placeholder="发送消息或创建 AI 应用..."
      :app-name="appName"
      :app-avatar="appAvatar"
      :user-name="userName"
      :opening-statement="openingStatement"
      :opening-questions="openingQuestions"
      :messages="displayMessages"
      :chat-roles="chatRoles"
      :attachments="[]"
      :responding="loading"
      :show-clear-button="false"
      :show-memory-button="false"
      :voice-input-enabled="false"
      :transcribing-voice="false"
      @submit-suggested="submitSuggestedPrompt"
      @upload-files="() => undefined"
      @remove-attachment="() => undefined"
      @submit-message="submitMessage"
      @submit-voice="() => undefined"
      @toggle-audio-text="() => undefined"
      @stop-response="stopResponse"
      @load-more-history="() => undefined"
    />
  </main>
</template>

<style scoped lang="scss">
.home-builder {
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
  --radius-md: 0.8rem;
  --space-2: 0.8rem;
  --space-3: 1.2rem;
  --space-4: 1.6rem;

  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background-color: var(--white);
  background-position: center;
  background-size: cover;
}

.home-builder :deep(.app-orchestration__preview) {
  height: 100vh;
  background: transparent;
}

.home-builder :deep(.orchestration-panel__header) {
  display: none;
}

.home-builder :deep(.chat-preview) {
  background: transparent;
}

.home-builder :deep(.chat-preview__empty) {
  gap: 1.8rem;
}

.home-builder :deep(.chat-preview__empty-avatar) {
  width: 8.8rem;
  height: 8.8rem;
  border-radius: 1.6rem;
}

.home-builder :deep(.chat-preview__empty strong) {
  max-width: 56rem;
  font-size: 4.2rem;
  line-height: 5.2rem;
}

.home-builder :deep(.chat-preview__opening) {
  max-width: 68rem;
  font-size: 1.75rem;
  line-height: 3rem;
}

.home-builder :deep(.chat-preview__opening-questions) {
  max-width: 76rem;
  gap: 1.2rem;
}

.home-builder :deep(.chat-preview__opening-questions button) {
  min-height: 4.6rem;
  padding: 0.9rem 1.6rem;
  font-size: 1.55rem;
  line-height: 2.2rem;
}

.home-builder :deep(.chat-composer) {
  background: transparent;
}

@media (max-width: 920px) {
  .home-builder :deep(.chat-preview__empty-avatar) {
    width: 7.2rem;
    height: 7.2rem;
  }

  .home-builder :deep(.chat-preview__empty strong) {
    font-size: 3.2rem;
    line-height: 4rem;
  }

  .home-builder :deep(.chat-preview__opening) {
    font-size: 1.5rem;
    line-height: 2.5rem;
  }

  .home-builder :deep(.chat-preview__opening-questions button) {
    min-height: 4rem;
    font-size: 1.35rem;
    line-height: 2rem;
  }
}
</style>
