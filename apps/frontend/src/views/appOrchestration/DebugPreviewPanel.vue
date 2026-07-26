<script setup lang="ts">
import type { AppKnowledgeCitation } from '@/api'
import { renderMarkdown } from '@/utils/markdown'
import { BookOpen, Bot, ChevronDown, CircleStop, Paperclip, Save, Send, Trash2 } from '@lucide/vue'
import { Bubble, Sender } from 'ant-design-x-vue'
import type { BubbleListProps } from 'ant-design-x-vue'
import { Button } from 'antdv-next'
import { computed, ref, type VNode } from 'vue'

export type DebugChatMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  footer?: VNode
  pending?: boolean
  knowledgeQuery?: string
  knowledgeCitations?: AppKnowledgeCitation[]
}

type ChatRoles = NonNullable<BubbleListProps['roles']>

type KnowledgeCitationView = {
  queries: string[]
  knowledgeNames: string[]
  showItemKnowledgeName: boolean
}

type DebugChatDisplayMessage = DebugChatMessage & {
  knowledgeCitationView: KnowledgeCitationView
}

const props = defineProps<{
  appName: string
  appAvatar: string
  userName: string
  openingStatement: string
  openingQuestions: string[]
  messages: DebugChatMessage[]
  chatRoles: ChatRoles
  senderValue: string
  responding: boolean
}>()

const emit = defineEmits<{
  'update:senderValue': [value: string]
  clearChat: []
  openMemory: []
  submitSuggested: [value: string]
  submitMessage: [value: string]
  stopResponse: []
}>()

const chatListRef = ref<HTMLElement>()
const senderModel = computed({
  get: () => props.senderValue,
  set: (value: string) => emit('update:senderValue', value),
})

const normalizeTextList = (items: Array<string | undefined>) => [
  ...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))),
]

const createKnowledgeCitationView = (message: DebugChatMessage): KnowledgeCitationView => {
  const citations = message.knowledgeCitations ?? []
  if (!citations.length) {
    return { queries: [], knowledgeNames: [], showItemKnowledgeName: false }
  }

  const queries = normalizeTextList([
    message.knowledgeQuery,
    ...citations.flatMap((citation) => citation.queries ?? []),
  ])
  const knowledgeNames = normalizeTextList(citations.map((citation) => citation.knowledgeName))

  return {
    queries,
    knowledgeNames,
    showItemKnowledgeName: knowledgeNames.length > 1,
  }
}

const displayMessages = computed<DebugChatDisplayMessage[]>(() =>
  props.messages.map((message) => ({
    ...message,
    knowledgeCitationView: createKnowledgeCitationView(message),
  })),
)

function scrollToBottom() {
  if (chatListRef.value) {
    chatListRef.value.scrollTop = chatListRef.value.scrollHeight
  }
}

defineExpose({ scrollToBottom })
</script>

<template>
  <section class="app-orchestration__preview orchestration-workspace-panel">
    <div class="orchestration-panel__header preview-header">
      <h2>预览与调试</h2>
      <div class="preview-header__actions">
        <Button type="text" size="small" @click="emit('clearChat')">
          <template #icon><Trash2 :size="15" /></template>
          清空对话
        </Button>
        <Button type="link" size="small" @click="emit('openMemory')">
          <template #icon><Save :size="15" /></template>
          长期记忆
        </Button>
      </div>
    </div>

    <div ref="chatListRef" class="chat-preview">
      <div v-if="messages.length === 0" class="chat-preview__empty">
        <div class="chat-preview__empty-avatar" :class="{ 'has-image': appAvatar }">
          <img v-if="appAvatar" :src="appAvatar" alt="" />
          <Bot v-else :size="24" />
        </div>
        <strong>{{ appName }}</strong>
        <p v-if="openingStatement.trim()" class="chat-preview__opening">
          {{ openingStatement }}
        </p>
        <div v-if="openingQuestions.length" class="chat-preview__opening-questions">
          <button
            v-for="question in openingQuestions"
            :key="question"
            type="button"
            @click="emit('submitSuggested', question)"
          >
            {{ question }}
          </button>
        </div>
      </div>

      <Bubble.List v-else :items="displayMessages" :roles="chatRoles">
        <template #header="{ item }">
          <div class="chat-message-header">
            <span>{{ item.role === 'assistant' ? appName : userName }}</span>
            <details
              v-if="item.role === 'assistant' && item.knowledgeCitations?.length"
              class="knowledge-citations"
            >
              <summary>
                <BookOpen :size="14" />
                <span>已搜索知识库 · {{ item.knowledgeCitations.length }} 个片段</span>
                <ChevronDown :size="14" />
              </summary>
              <div class="knowledge-citations__panel">
                <div
                  v-if="
                    item.knowledgeCitationView.queries.length ||
                    item.knowledgeCitationView.knowledgeNames.length
                  "
                  class="knowledge-citations__summary"
                >
                  <p v-if="item.knowledgeCitationView.queries.length">
                    <span>检索问题</span>
                    <strong>{{ item.knowledgeCitationView.queries.join('；') }}</strong>
                  </p>
                  <p v-if="item.knowledgeCitationView.knowledgeNames.length">
                    <span>命中知识库</span>
                    <strong>{{ item.knowledgeCitationView.knowledgeNames.join('、') }}</strong>
                  </p>
                </div>
                <ol>
                  <li v-for="citation in item.knowledgeCitations" :key="citation.id">
                    <div class="knowledge-citations__item-head">
                      <strong
                        >{{ citation.documentName }} · 片段 #{{ citation.chunkIndex + 1 }}</strong
                      >
                      <em>匹配度 {{ citation.score.toFixed(2) }}</em>
                    </div>
                    <span v-if="item.knowledgeCitationView.showItemKnowledgeName">
                      {{ citation.knowledgeName }}
                    </span>
                    <p>{{ citation.text }}</p>
                  </li>
                </ol>
              </div>
            </details>
          </div>
        </template>
        <template #message="{ item }">
          <div
            class="chat-markdown"
            v-html="renderMarkdown(item.content || (item.pending ? '...' : ''))"
          ></div>
        </template>
      </Bubble.List>
    </div>

    <Button v-if="responding" class="stop-button" @click="emit('stopResponse')">
      <template #icon><CircleStop :size="14" /></template>
      停止响应
    </Button>

    <footer class="chat-composer">
      <div class="composer-row">
        <Sender
          v-model:value="senderModel"
          :placeholder="responding ? '正在生成回复...' : '输入调试消息...'"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          class="app-chat-composer"
          @submit="(value) => emit('submitMessage', value)"
        >
          <template #prefix>
            <Button type="text" shape="circle">
              <template #icon><Paperclip :size="16" /></template>
            </Button>
          </template>
          <template #actions>
            <Button type="text" shape="circle" @click="emit('submitMessage', senderValue)">
              <template #icon><Send :size="16" /></template>
            </Button>
          </template>
        </Sender>
      </div>
      <p>内容由AI生成，无法确保真实准确，仅供参考。</p>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.app-orchestration__preview,
.app-orchestration__preview *,
.app-orchestration__preview *::before,
.app-orchestration__preview *::after {
  box-sizing: border-box;
}

.orchestration-workspace-panel {
  min-width: 0;
  min-height: 0;
  background: var(--color-bg-panel);
}

.app-orchestration__preview {
  display: flex;
  flex-direction: column;
}

.orchestration-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 6.4rem;
  padding: 0 2.4rem;
  border-bottom: 0.1rem solid var(--color-border-light);
}

.orchestration-panel__header h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.preview-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 2.8rem 2.4rem;
  overflow-y: auto;
  background: var(--color-bg-panel);
}

.chat-preview__empty {
  display: grid;
  flex: 1;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  min-height: 24rem;
  color: var(--color-text-strong);
  text-align: center;
}

.chat-preview__empty-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 6.4rem;
  height: 6.4rem;
  color: var(--color-white);
  background: var(--color-success);
  border-radius: 1.2rem;
}

.chat-preview__empty-avatar.has-image {
  overflow: hidden;
  background: var(--color-bg-soft);
}

.chat-preview__empty-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-preview__empty strong {
  max-width: 28rem;
  overflow-wrap: anywhere;
  font-size: 2.8rem;
  line-height: 3.6rem;
}

.chat-preview__opening {
  max-width: min(42rem, 100%);
  margin: 0;
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 2.2rem;
  white-space: pre-wrap;
}

.chat-preview__opening-questions {
  display: flex;
  max-width: min(42rem, 100%);
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}

.chat-preview__opening-questions button {
  min-height: 3.6rem;
  max-width: 100%;
  padding: 0.7rem var(--space-3);
  overflow-wrap: anywhere;
  color: var(--color-text);
  font: inherit;
  font-size: 1.3rem;
  line-height: 1.8rem;
  text-align: left;
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.chat-preview__opening-questions button:hover,
.chat-preview__opening-questions button:focus-visible {
  color: var(--color-primary);
  border-color: var(--color-primary);
  outline: 0;
}

.stop-button {
  display: flex;
  align-self: center;
  margin: 0.6rem auto 0.8rem;
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.stop-button:hover,
.stop-button:focus-visible {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.stop-button :deep(svg) {
  color: currentColor;
}

.chat-composer {
  padding: 0 6.4rem 2rem;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.app-chat-composer {
  flex: 1;
  background: var(--color-bg-panel);
}

.chat-composer p {
  margin: 1.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  text-align: center;
}

:global(.chat-avatar) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  color: var(--color-white);
  font-size: 1.2rem;
  border-radius: 50%;
}

:global(.chat-avatar--user) {
  background: var(--color-border);
}

:global(.chat-avatar--assistant) {
  background: var(--color-success);
}

:global(.chat-avatar.has-image) {
  overflow: hidden;
  background: var(--color-bg-soft);
}

:global(.chat-avatar img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:global(.chat-markdown) {
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  color: inherit;
  font-size: 1.4rem;
  line-height: 2.35rem;
}

:global(.chat-markdown > :first-child) {
  margin-top: 0;
}

:global(.chat-markdown > :last-child) {
  margin-bottom: 0;
}

:global(.chat-markdown h1),
:global(.chat-markdown h2),
:global(.chat-markdown h3),
:global(.chat-markdown h4) {
  margin: 1.6rem 0 0.7rem;
  color: var(--color-text-strong);
  font-weight: 650;
  letter-spacing: 0;
}

:global(.chat-markdown h1),
:global(.chat-markdown h2) {
  padding-bottom: 0.7rem;
  font-size: 1.8rem;
  line-height: 2.6rem;
  border-bottom: 0.1rem solid #d9d9e3;
}

:global(.chat-markdown h3) {
  font-size: 1.55rem;
  line-height: 2.35rem;
}

:global(.chat-markdown h4) {
  font-size: 1.4rem;
  line-height: 2.2rem;
}

:global(.chat-markdown p),
:global(.chat-markdown ul),
:global(.chat-markdown ol),
:global(.chat-markdown blockquote),
:global(.chat-markdown pre),
:global(.chat-markdown table) {
  margin: 1rem 0;
}

:global(.chat-markdown p) {
  margin: 0.65rem 0;
  color: var(--color-text);
}

:global(.chat-markdown ul),
:global(.chat-markdown ol) {
  margin: 0.7rem 0;
  padding-left: 1.8rem;
}

:global(.chat-markdown li) {
  padding-left: 0.2rem;
}

:global(.chat-markdown li + li) {
  margin-top: 0.35rem;
}

:global(.chat-markdown li::marker) {
  color: var(--color-text-muted);
}

:global(.chat-markdown strong) {
  color: var(--color-text-strong);
  font-weight: 650;
}

:global(.chat-markdown hr) {
  height: 0.1rem;
  margin: 1.6rem 0;
  background: #d9d9e3;
  border: 0;
}

:global(.chat-markdown code) {
  padding: 0.14rem 0.46rem;
  color: var(--color-text-strong);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 1.22rem;
  background: rgba(236, 236, 241, 0.95);
  border-radius: 0.4rem;
}

:global(.chat-markdown pre) {
  max-width: 100%;
  padding: 1.2rem 1.4rem;
  overflow-x: auto;
  background: #111827;
  border-radius: var(--radius-sm);
}

:global(.chat-markdown pre code) {
  display: block;
  padding: 0;
  color: #f9fafb;
  background: transparent;
  border-radius: 0;
  white-space: pre;
}

:global(.chat-markdown blockquote) {
  margin: 1.1rem 0;
  padding: 0.7rem 0 0.7rem 1rem;
  color: var(--color-text);
  background: transparent;
  border-left: 0.3rem solid #10a37f;
  border-radius: 0;
}

:global(.chat-markdown blockquote p) {
  color: inherit;
}

:global(.chat-markdown a) {
  color: var(--color-primary);
  text-decoration: none;
}

:global(.chat-markdown a:hover) {
  text-decoration: underline;
}

:global(.chat-markdown table) {
  display: table;
  width: 100%;
  min-width: 100%;
  overflow: hidden;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--color-text);
  font-size: 1.3rem;
  line-height: 2rem;
  table-layout: fixed;
  white-space: normal;
  background: var(--color-white);
  border: 0.1rem solid #d9d9e3;
  border-radius: 0.6rem;
}

:global(.chat-markdown th),
:global(.chat-markdown td) {
  padding: 0.75rem 0.95rem;
  overflow-wrap: anywhere;
  text-align: left;
  vertical-align: middle;
  border: 0;
  border-right: 0.1rem solid #d9d9e3;
  border-bottom: 0.1rem solid #d9d9e3;
}

:global(.chat-markdown th) {
  color: var(--color-text-strong);
  font-weight: 600;
  background: #ececf1;
}

:global(.chat-markdown tbody tr:nth-child(even) td) {
  background: #f7f7f8;
}

:global(.chat-markdown tr > :last-child) {
  border-right: 0;
}

:global(.chat-markdown tbody tr:last-child td) {
  border-bottom: 0;
}

:global(.chat-message-header) {
  display: grid;
  justify-items: start;
  gap: var(--space-1);
  min-width: 0;
}

:global(.chat-message-header > span) {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.chat-message-footer) {
  display: grid;
  align-items: start;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.6rem;
  white-space: normal;
}

:global(.chat-message-footer__meta) {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  white-space: nowrap;
}

:global(.chat-message-footer__actions) {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity 0.16s ease;
}

:global(.chat-message-footer__button) {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

:global(.chat-message-footer__button:hover),
:global(.chat-message-footer__button:focus-visible) {
  color: var(--color-primary);
  outline: 0;
}

:global(.chat-message-item:hover .chat-message-footer__actions),
:global(.chat-message-item:focus-within .chat-message-footer__actions),
:global(.chat-message-footer:hover .chat-message-footer__actions),
:global(.chat-message-footer:focus-within .chat-message-footer__actions) {
  opacity: 1;
}

:global(.chat-message-suggestions) {
  max-width: 42rem;
  margin-top: var(--space-1);
}

.knowledge-citations {
  margin: 0.2rem 0;
}

.knowledge-citations summary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 3.2rem;
  padding: 0 var(--space-3);
  color: var(--color-primary);
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.8rem;
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  list-style: none;
}

.knowledge-citations summary::-webkit-details-marker {
  display: none;
}

.knowledge-citations[open] summary > :last-child {
  transform: rotate(180deg);
}

.knowledge-citations__panel {
  display: grid;
  gap: var(--space-2);
  max-width: 42rem;
  margin-top: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.knowledge-citations__summary {
  display: grid;
  gap: 0.4rem;
  padding-bottom: var(--space-1);
  border-bottom: 0.1rem solid var(--color-border-light);
}

.knowledge-citations__summary p {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.knowledge-citations__summary span {
  color: var(--color-text-subtle);
}

.knowledge-citations__summary strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-weight: 500;
}

.knowledge-citations__panel ol {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.knowledge-citations__panel li {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.knowledge-citations__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.knowledge-citations__item-head strong,
.knowledge-citations__item-head em,
.knowledge-citations__panel li > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-citations__item-head strong {
  min-width: 0;
  color: var(--color-text-strong);
  font-size: 1.3rem;
  font-weight: 600;
}

.knowledge-citations__item-head em,
.knowledge-citations__panel li > span {
  flex: none;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  font-style: normal;
  line-height: 1.7rem;
}

.knowledge-citations__panel li p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 1.2rem;
  line-height: 1.8rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

@media (max-width: 1180px) {
  .app-orchestration__preview {
    min-height: 67.2rem;
  }
}

@media (max-width: 700px) {
  .orchestration-panel__header,
  .chat-preview,
  .chat-composer {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }
}
</style>
