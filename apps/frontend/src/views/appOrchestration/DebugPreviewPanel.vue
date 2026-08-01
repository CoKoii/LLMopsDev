<script setup lang="ts">
import type { AppAttachmentCitation, AppKnowledgeCitation } from '@/api'
import type { AppDebugAttachment } from '@/stores/appDebug'
import type { DebugComposerAttachment } from './useAppDebugSession'
import { renderMarkdown } from '@/utils/markdown'
import {
  BookOpen,
  Bot,
  ChevronDown,
  CircleStop,
  CloudUpload,
  LoaderCircle,
  Mic,
  Paperclip,
  Save,
  Send,
  Trash2,
} from '@lucide/vue'
import { Attachments, Bubble, Sender } from 'ant-design-x-vue'
import type { Attachment, AttachmentsProps, BubbleListProps } from 'ant-design-x-vue'
import { Button, message } from 'antdv-next'
import { computed, h, onBeforeUnmount, onMounted, ref, watch, type VNode } from 'vue'

export type DebugChatMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AppDebugAttachment[]
  footer?: VNode
  pending?: boolean
  knowledgeQuery?: string
  knowledgeCitations?: AppKnowledgeCitation[]
  attachmentQuery?: string
  attachmentCitations?: AppAttachmentCitation[]
  statusText?: string
  audioMessage?: boolean
  audioUrl?: string
  audioGenerating?: boolean
  audioTranscribing?: boolean
  audioTextVisible?: boolean
}

type ChatRoles = NonNullable<BubbleListProps['roles']>

type KnowledgeCitationView = {
  queries: string[]
  knowledgeNames: string[]
  showItemKnowledgeName: boolean
}

type AttachmentCitationView = {
  queries: string[]
  fileNames: string[]
}

type MessageUiState = {
  bubbleContentClassName: string
  bubbleRootClassName: string
  showText: boolean
  showTextStatus: boolean
  showVoiceBubble: boolean
  showVoiceStatus: boolean
}

type DebugChatDisplayMessage = DebugChatMessage & {
  knowledgeCitationView: KnowledgeCitationView
  attachmentCitationView: AttachmentCitationView
  ui: MessageUiState
}

const acceptedAttachmentTypes =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.markdown,.json,.html,.htm'
const attachmentPlaceholder: AttachmentsProps['placeholder'] = (type) =>
  type === 'drop'
    ? { title: '拖拽文件到这里' }
    : {
        icon: h(CloudUpload, { size: 20 }),
        title: '上传文件',
        description: '点击或拖拽文件到这里上传',
      }
const senderHeaderStyles = {
  content: {
    padding: 0,
  },
}

const props = defineProps<{
  title?: string
  composerPlaceholder?: string
  appName: string
  appAvatar: string
  userName: string
  openingStatement: string
  openingQuestions: string[]
  messages: DebugChatMessage[]
  chatRoles: ChatRoles
  senderValue: string
  attachments: DebugComposerAttachment[]
  responding: boolean
  showClearButton?: boolean
  showMemoryButton: boolean
  voiceInputEnabled: boolean
  transcribingVoice: boolean
  historyLoading?: boolean
  hasMoreHistory?: boolean
}>()

const emit = defineEmits<{
  'update:senderValue': [value: string]
  clearChat: []
  openMemory: []
  uploadFiles: [files: File[]]
  removeAttachment: [uid: string]
  submitSuggested: [value: string]
  submitMessage: [value: string]
  submitVoice: [file: File]
  toggleAudioText: [key: string]
  stopResponse: []
  loadMoreHistory: []
}>()

const panelRef = ref<HTMLElement>()
const chatListRef = ref<HTMLElement>()
const attachmentsRef = ref<InstanceType<typeof Attachments> | null>(null)
const senderRef = ref<InstanceType<typeof Sender> | null>(null)
const attachmentsOpen = ref(false)
const attachmentItems = ref<Attachment[]>([])
const audioElements = new Map<string, HTMLAudioElement>()
const audioDurations = ref<Record<string, number>>({})
const audioProgresses = ref<Record<string, number>>({})
const playingAudioKey = ref('')
const voiceContextMenu = ref({ key: '', visible: false, x: 0, y: 0 })
const voiceRecording = ref(false)
let mediaRecorder: MediaRecorder | undefined
let voiceChunks: Blob[] = []
let voiceStartedAt = 0
let audioProgressFrame = 0
const voiceMimeCandidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm']
const senderModel = computed({
  get: () => props.senderValue,
  set: (value: string) => emit('update:senderValue', value),
})
const hasUploadingAttachments = computed(() =>
  props.attachments.some((item) => item.status === 'uploading'),
)

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

const createAttachmentCitationView = (message: DebugChatMessage): AttachmentCitationView => {
  const citations = message.attachmentCitations ?? []
  if (!citations.length) return { queries: [], fileNames: [] }

  return {
    queries: normalizeTextList([
      message.attachmentQuery,
      ...citations.flatMap((citation) => citation.queries ?? []),
    ]),
    fileNames: normalizeTextList(
      citations.map((citation) => citation.displayLabel || citation.fileName),
    ),
  }
}

const displayMessages = computed<DebugChatDisplayMessage[]>(() =>
  props.messages.map((message) => {
    const displayMessage = {
      ...message,
      knowledgeCitationView: createKnowledgeCitationView(message),
      attachmentCitationView: createAttachmentCitationView(message),
    }
    const ui = createMessageUiState(displayMessage)

    return {
      ...displayMessage,
      ui,
      rootClassName: ui.bubbleRootClassName,
      classNames: {
        content: ui.bubbleContentClassName,
      },
    }
  }),
)

const voiceBubbleWidthRem = 18
const voiceBarCount = 14
const voiceBarPattern = [8, 13, 18, 12, 22, 16, 10, 19, 24, 14, 20, 15]

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

const toFileCardItem = (attachment: AppDebugAttachment | DebugComposerAttachment): Attachment => ({
  uid: attachment.uid,
  name: attachment.name,
  size: attachment.size,
  type: attachment.contentType,
  url: attachment.url,
  status: 'status' in attachment ? attachment.status : 'done',
  description:
    'status' in attachment && attachment.status === 'error'
      ? attachment.error || '上传失败'
      : formatFileSize(attachment.size),
})

const composerAttachmentItems = computed(() =>
  attachmentItems.value.map((item: Attachment): Attachment => {
    const uploaded = props.attachments.find((attachment) => attachment.uid === item.uid)
    if (!uploaded) return item

    return {
      ...item,
      type: item.type || uploaded.contentType,
      size: item.size ?? uploaded.size,
      url: item.url || uploaded.url,
      status: uploaded.status === 'error' ? 'error' : item.status,
      response: uploaded.error,
      description:
        uploaded.status === 'error'
          ? uploaded.error || '上传失败'
          : item.description || formatFileSize(uploaded.size),
    }
  }),
)

watch(
  () => props.attachments.length,
  (length) => {
    if (!length) {
      attachmentItems.value = []
    }
  },
)

function toggleAttachmentsOpen() {
  attachmentsOpen.value = !attachmentsOpen.value
}

function handleAttachmentsOpenChange(open: boolean) {
  attachmentsOpen.value = open
}

const handleBeforeUpload: NonNullable<AttachmentsProps['beforeUpload']> = (file) => {
  attachmentsOpen.value = true
  emit('uploadFiles', [file as File])
  return false
}

const handleAttachmentChange: NonNullable<AttachmentsProps['onChange']> = ({ fileList }) => {
  attachmentItems.value = fileList
}

function handleRemoveAttachment(attachment: Attachment) {
  emit('removeAttachment', attachment.uid)
  return true
}

function getDropContainer() {
  return senderRef.value?.nativeElement
}

function handlePasteFile(_: File, files: FileList) {
  attachmentsOpen.value = true
  if (attachmentsRef.value) {
    attachmentsRef.value.upload(files)
    return
  }
  emit('uploadFiles', Array.from(files))
}

function handleSubmit(value: string) {
  attachmentsOpen.value = false
  emit('submitMessage', value)
}

function setAudioElement(key: string, element: Element | null) {
  if (element instanceof HTMLAudioElement) {
    audioElements.set(key, element)
    return
  }
  if (playingAudioKey.value === key) stopAudioProgressLoop()
  audioElements.delete(key)
}

function formatAudioTime(seconds: number | undefined) {
  const total = Number.isFinite(seconds) && seconds ? Math.max(0, Math.round(seconds)) : 0
  const minutes = Math.floor(total / 60)
  const remainingSeconds = `${total % 60}`.padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}

function getAudioStatus(item: DebugChatDisplayMessage) {
  if (item.ui.showVoiceStatus) return normalizeStatusText(item.statusText) || '生成中'
  if (
    item.audioGenerating ||
    (item.pending && item.audioMessage && !audioDurations.value[item.key])
  ) {
    return '生成中'
  }
  const progress = audioProgresses.value[item.key]
  const duration = audioDurations.value[item.key]
  if (!progress && !duration) return ''
  return formatAudioTime(progress || duration)
}

function getVoiceBubbleStyle() {
  return {
    width: `${voiceBubbleWidthRem}rem`,
  }
}

function getVoiceBars() {
  return Array.from(
    { length: voiceBarCount },
    (_, index) => voiceBarPattern[index % voiceBarPattern.length] ?? voiceBarPattern[0] ?? 12,
  )
}

function getVoiceBarClass(item: DebugChatDisplayMessage) {
  return {
    'is-loading': item.audioGenerating || item.audioTranscribing,
  }
}

function getAudioProgressRatio(item: DebugChatDisplayMessage) {
  const duration = audioDurations.value[item.key]
  if (!duration) return 0
  const progress = audioProgresses.value[item.key] ?? 0
  return Math.min(1, Math.max(0, progress / duration))
}

function getVoiceWaveStyle(item: DebugChatDisplayMessage) {
  return {
    '--voice-progress': `${getAudioProgressRatio(item) * 100}%`,
  }
}

function getVoiceBarStyle(height: number, index: number) {
  return {
    height: `${height}px`,
    animationDelay: `${index * 0.04}s`,
  }
}

function handleAudioLoaded(item: DebugChatDisplayMessage, event: Event) {
  const audio = event.target
  if (!(audio instanceof HTMLAudioElement) || !Number.isFinite(audio.duration)) return
  audioDurations.value = { ...audioDurations.value, [item.key]: audio.duration }
}

function updateAudioProgress(key: string, currentTime: number) {
  audioProgresses.value = { ...audioProgresses.value, [key]: currentTime }
}

function stopAudioProgressLoop() {
  if (audioProgressFrame) {
    cancelAnimationFrame(audioProgressFrame)
    audioProgressFrame = 0
  }
}

function syncPlayingAudioProgress() {
  const key = playingAudioKey.value
  const audio = key ? audioElements.get(key) : undefined
  if (!audio || audio.paused || audio.ended) {
    stopAudioProgressLoop()
    return
  }

  updateAudioProgress(key, audio.currentTime)
  audioProgressFrame = requestAnimationFrame(syncPlayingAudioProgress)
}

function startAudioProgressLoop() {
  stopAudioProgressLoop()
  audioProgressFrame = requestAnimationFrame(syncPlayingAudioProgress)
}

function handleAudioTimeUpdate(item: DebugChatDisplayMessage, event: Event) {
  if (playingAudioKey.value === item.key) return
  const audio = event.target
  if (audio instanceof HTMLAudioElement) updateAudioProgress(item.key, audio.currentTime)
}

function handleAudioEnded(item: DebugChatDisplayMessage) {
  stopAudioProgressLoop()
  if (playingAudioKey.value === item.key) playingAudioKey.value = ''
  updateAudioProgress(item.key, 0)
}

function toggleVoicePlayback(item: DebugChatDisplayMessage) {
  if (!item.audioUrl || item.audioGenerating) return
  const audio = audioElements.get(item.key)
  if (!audio) return

  if (playingAudioKey.value && playingAudioKey.value !== item.key) {
    audioElements.get(playingAudioKey.value)?.pause()
  }

  if (audio.paused) {
    void audio.play().then(() => {
      playingAudioKey.value = item.key
      updateAudioProgress(item.key, audio.currentTime)
      startAudioProgressLoop()
    })
    return
  }

  audio.pause()
  playingAudioKey.value = ''
  stopAudioProgressLoop()
  updateAudioProgress(item.key, audio.currentTime)
}

function normalizeStatusText(text: string | undefined) {
  const value = text?.replace(/[.。…]+$/g, '').trim() ?? ''
  if (value.includes('回复')) return '生成中'
  if (value.includes('语音')) return '合成中'
  return value
}

function createMessageUiState(item: DebugChatMessage): MessageUiState {
  const content = item.content.trim()
  const processing = Boolean(item.pending || item.audioGenerating || item.audioTranscribing)
  const showVoiceBubble = Boolean(item.audioMessage || item.audioUrl)
  const showText = item.audioMessage ? Boolean(item.audioTextVisible) : Boolean(content)
  const showTextStatus = Boolean(item.statusText && !showVoiceBubble && !content && processing)
  const showVoiceStatus = Boolean(
    showVoiceBubble && !item.audioUrl && item.statusText && processing,
  )
  const fullTextBubble =
    item.role === 'assistant' &&
    showText &&
    !item.audioMessage &&
    Boolean(content) &&
    (item.pending || content.length > 24)
  const hideContent = !showTextStatus && !showVoiceBubble && !showText
  const bubbleContentClassName = [
    hideContent ? 'debug-bubble-content--empty' : '',
    showTextStatus ? 'debug-bubble-content--status' : '',
    showVoiceBubble ? 'debug-bubble-content--voice' : '',
    fullTextBubble ? 'debug-bubble-content--text' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    bubbleContentClassName,
    bubbleRootClassName: fullTextBubble ? 'debug-bubble--text' : '',
    showText,
    showTextStatus,
    showVoiceBubble,
    showVoiceStatus,
  }
}

function closeVoiceContextMenu() {
  voiceContextMenu.value = { key: '', visible: false, x: 0, y: 0 }
}

function openVoiceContextMenu(item: DebugChatDisplayMessage, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!item.content.trim()) {
    closeVoiceContextMenu()
    return
  }
  voiceContextMenu.value = {
    key: item.key,
    visible: true,
    x: event.clientX,
    y: event.clientY,
  }
}

function toggleAudioTextFromMenu() {
  if (!voiceContextMenu.value.key) return
  emit('toggleAudioText', voiceContextMenu.value.key)
  closeVoiceContextMenu()
}

function resolveVoiceMimeType() {
  return voiceMimeCandidates.find((type) => MediaRecorder.isTypeSupported(type))
}

async function startVoiceRecording(event: PointerEvent) {
  event.preventDefault()
  if (
    !props.voiceInputEnabled ||
    props.responding ||
    props.transcribingVoice ||
    hasUploadingAttachments.value ||
    voiceRecording.value
  ) {
    return
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    message.warning('当前浏览器不支持录音')
    return
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    message.warning('无法获取麦克风权限')
    return
  }
  voiceChunks = []
  voiceStartedAt = Date.now()
  const mimeType = resolveVoiceMimeType()
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  mediaRecorder.ondataavailable = (recordEvent) => {
    if (recordEvent.data.size > 0) voiceChunks.push(recordEvent.data)
  }
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop())
    voiceRecording.value = false
    const duration = Date.now() - voiceStartedAt
    if (duration < 400 || !voiceChunks.length) return

    const type = mediaRecorder?.mimeType || 'audio/webm'
    const extension = type.includes('ogg') ? 'ogg' : 'webm'
    emit(
      'submitVoice',
      new File([new Blob(voiceChunks, { type })], `voice-${Date.now()}.${extension}`, { type }),
    )
  }
  mediaRecorder.start()
  voiceRecording.value = true
}

function stopVoiceRecording() {
  if (!voiceRecording.value || mediaRecorder?.state !== 'recording') return
  mediaRecorder.stop()
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeVoiceContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeVoiceContextMenu)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeVoiceContextMenu)
  window.removeEventListener('keydown', handleWindowKeydown)
  stopAudioProgressLoop()
})

watch(
  () => props.responding,
  (responding) => {
    if (responding) attachmentsOpen.value = false
  },
)

function getScrollElement() {
  const panel = panelRef.value
  if (panel && panel.scrollHeight > panel.clientHeight) return panel
  return chatListRef.value
}

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 48
}

function scrollToBottom(force = true) {
  const element = getScrollElement()
  if (!element || (!force && !isNearBottom(element))) return
  element.scrollTop = element.scrollHeight
}

function getScrollState() {
  const element = getScrollElement()
  if (!element) return { scrollTop: 0, scrollHeight: 0 }
  return {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
  }
}

function restoreScrollFromTop(previous: { scrollTop: number; scrollHeight: number }) {
  const element = getScrollElement()
  if (!element) return
  element.scrollTop = element.scrollHeight - previous.scrollHeight + previous.scrollTop
}

function handleChatScroll(event?: Event) {
  const target = event?.currentTarget
  const element = target instanceof HTMLElement ? target : getScrollElement()
  if (!element) return
  if (!props.hasMoreHistory || props.historyLoading) return
  if (element.scrollTop <= 24) emit('loadMoreHistory')
}

defineExpose({ scrollToBottom, getScrollState, restoreScrollFromTop })
</script>

<template>
  <section
    ref="panelRef"
    class="app-orchestration__preview orchestration-workspace-panel"
    @scroll="handleChatScroll"
  >
    <div class="orchestration-panel__header preview-header">
      <h2>{{ title || '预览与调试' }}</h2>
      <div class="preview-header__actions">
        <Button v-if="showClearButton !== false" type="text" size="small" @click="emit('clearChat')">
          <template #icon><Trash2 :size="15" /></template>
          清空对话
        </Button>
        <Button v-if="showMemoryButton" type="link" size="small" @click="emit('openMemory')">
          <template #icon><Save :size="15" /></template>
          长期记忆
        </Button>
      </div>
    </div>

    <div ref="chatListRef" class="chat-preview" @scroll="handleChatScroll">
      <div v-if="historyLoading" class="chat-preview__history-loading">正在加载历史消息...</div>
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
          <div
            class="chat-message-header"
            :class="{
              'chat-message-header--user': item.role === 'user',
              'chat-message-header--assistant': item.role === 'assistant',
            }"
          >
            <span>{{ item.role === 'assistant' ? appName : userName }}</span>
            <div
              v-if="item.role === 'user' && item.attachments?.length"
              class="chat-message-attachments"
            >
              <Attachments.FileCard
                v-for="attachment in item.attachments"
                :key="attachment.uid"
                :item="toFileCardItem(attachment)"
              />
            </div>
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
            <details
              v-if="item.role === 'assistant' && item.attachmentCitations?.length"
              class="knowledge-citations"
            >
              <summary>
                <Paperclip :size="14" />
                <span>已检索附件 · {{ item.attachmentCitations.length }} 个片段</span>
                <ChevronDown :size="14" />
              </summary>
              <div class="knowledge-citations__panel">
                <div
                  v-if="
                    item.attachmentCitationView.queries.length ||
                    item.attachmentCitationView.fileNames.length
                  "
                  class="knowledge-citations__summary"
                >
                  <p v-if="item.attachmentCitationView.queries.length">
                    <span>检索问题</span>
                    <strong>{{ item.attachmentCitationView.queries.join('；') }}</strong>
                  </p>
                  <p v-if="item.attachmentCitationView.fileNames.length">
                    <span>命中附件</span>
                    <strong>{{ item.attachmentCitationView.fileNames.join('、') }}</strong>
                  </p>
                </div>
                <ol>
                  <li v-for="citation in item.attachmentCitations" :key="citation.id">
                    <div class="knowledge-citations__item-head">
                      <strong>
                        {{ citation.displayLabel || citation.fileName }} · 片段 #{{
                          citation.chunkIndex + 1
                        }}
                      </strong>
                      <em>匹配度 {{ citation.score.toFixed(2) }}</em>
                    </div>
                    <span
                      v-if="citation.displayLabel && citation.displayLabel !== citation.fileName"
                    >
                      {{ citation.fileName }}
                    </span>
                    <span v-if="citation.duplicateOfLabel">
                      与{{ citation.duplicateOfLabel }}内容相同
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
            class="chat-message-content"
            :class="{
              'chat-message-content--status-only': item.ui.showTextStatus,
            }"
          >
            <div
              v-if="item.ui.showVoiceBubble"
              class="voice-message-row"
              :class="{
                'voice-message-row--user': item.role === 'user',
                'voice-message-row--assistant': item.role === 'assistant',
              }"
              @contextmenu="openVoiceContextMenu(item, $event)"
            >
              <button
                class="voice-bubble"
                type="button"
                :style="getVoiceBubbleStyle()"
                @click="toggleVoicePlayback(item)"
              >
                <span class="voice-bubble__wave" :style="getVoiceWaveStyle(item)">
                  <span class="voice-bubble__wave-layer voice-bubble__wave-layer--base">
                    <span
                      v-for="(height, index) in getVoiceBars()"
                      :key="index"
                      :class="getVoiceBarClass(item)"
                      :style="getVoiceBarStyle(height, index)"
                    ></span>
                  </span>
                  <span class="voice-bubble__wave-layer voice-bubble__wave-layer--progress">
                    <span
                      v-for="(height, index) in getVoiceBars()"
                      :key="index"
                      :class="getVoiceBarClass(item)"
                      :style="getVoiceBarStyle(height, index)"
                    ></span>
                  </span>
                </span>
                <span
                  class="voice-bubble__meta"
                  :class="{
                    'is-empty': !getAudioStatus(item),
                    'is-status': item.ui.showVoiceStatus || item.audioGenerating,
                  }"
                >
                  {{ getAudioStatus(item) }}
                </span>
              </button>
              <audio
                v-if="item.audioUrl"
                :ref="(element) => setAudioElement(item.key, element as Element | null)"
                :src="item.audioUrl"
                preload="metadata"
                @loadedmetadata="handleAudioLoaded(item, $event)"
                @durationchange="handleAudioLoaded(item, $event)"
                @timeupdate="handleAudioTimeUpdate(item, $event)"
                @ended="handleAudioEnded(item)"
              />
            </div>
            <div v-if="item.ui.showTextStatus" class="processing-status">
              <span>{{ normalizeStatusText(item.statusText) }}</span>
              <span class="processing-status__dots"><i></i><i></i><i></i></span>
            </div>
            <div
              v-if="item.ui.showText && item.audioMessage"
              class="transcript-bubble"
              :class="{
                'transcript-bubble--user': item.role === 'user',
              }"
            >
              <div class="chat-markdown" v-html="renderMarkdown(item.content)"></div>
            </div>
            <div
              v-else-if="item.ui.showText"
              class="chat-markdown"
              v-html="renderMarkdown(item.content)"
            ></div>
          </div>
        </template>
      </Bubble.List>
      <div
        v-if="voiceContextMenu.visible"
        class="voice-context-menu"
        :style="{ left: `${voiceContextMenu.x}px`, top: `${voiceContextMenu.y}px` }"
        @click.stop
        @contextmenu.prevent
      >
        <button type="button" @click="toggleAudioTextFromMenu">转文字</button>
      </div>
    </div>

    <footer class="chat-composer">
      <Button v-if="responding" class="stop-button" @click="emit('stopResponse')">
        <template #icon><CircleStop :size="14" /></template>
        停止响应
      </Button>

      <div class="composer-row">
        <Sender
          ref="senderRef"
          v-model:value="senderModel"
          :placeholder="responding ? '正在生成回复...' : composerPlaceholder || '输入调试消息...'"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          :send-disabled="responding || hasUploadingAttachments"
          class="app-chat-composer"
          :on-paste-file="handlePasteFile"
          :on-submit="handleSubmit"
        >
          <template #header>
            <Sender.Header
              title="附件"
              :open="attachmentsOpen"
              :force-render="true"
              :styles="senderHeaderStyles"
              :on-open-change="handleAttachmentsOpenChange"
            >
              <Attachments
                ref="attachmentsRef"
                :items="composerAttachmentItems"
                :placeholder="attachmentPlaceholder"
                :before-upload="handleBeforeUpload"
                :on-change="handleAttachmentChange"
                :on-remove="handleRemoveAttachment"
                :get-drop-container="getDropContainer"
                :disabled="responding"
                :accept="acceptedAttachmentTypes"
                multiple
                overflow="wrap"
              />
            </Sender.Header>
          </template>
          <template #prefix>
            <Button
              type="text"
              shape="circle"
              :disabled="responding"
              @click="toggleAttachmentsOpen"
            >
              <template #icon><Paperclip :size="16" /></template>
            </Button>
            <Button
              v-if="voiceInputEnabled"
              type="text"
              shape="circle"
              class="voice-record-button"
              :class="{ 'is-recording': voiceRecording }"
              :disabled="responding || transcribingVoice || hasUploadingAttachments"
              :title="voiceRecording ? '松开发送语音' : '按住说话'"
              @pointerdown="startVoiceRecording"
              @pointerup="stopVoiceRecording"
              @pointercancel="stopVoiceRecording"
              @pointerleave="stopVoiceRecording"
            >
              <template #icon>
                <LoaderCircle
                  v-if="transcribingVoice"
                  class="voice-record-button__loading"
                  :size="16"
                />
                <Mic v-else :size="16" />
              </template>
            </Button>
          </template>
          <template #actions>
            <Button
              type="text"
              shape="circle"
              :disabled="responding || hasUploadingAttachments"
              @click="handleSubmit(senderValue)"
            >
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

.app-orchestration__preview {
  --chat-bubble-adjacent-gap: 0.4rem;
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

.chat-preview__history-loading {
  align-self: center;
  margin-bottom: 1.2rem;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.8rem;
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
  position: absolute;
  top: -4.6rem;
  left: 50%;
  z-index: 3;
  display: flex;
  margin: 0;
  color: var(--color-primary);
  border-color: var(--color-primary);
  transform: translateX(-50%);
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
  position: relative;
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

:global(.chat-message-attachments) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

:global(.chat-message-content) {
  display: grid;
  gap: 0.7rem;
  min-width: 0;
}

:global(.chat-message-content--status-only) {
  gap: 0;
}

:global(.debug-bubble--text) {
  width: 100%;
}

:global(.debug-bubble--text .ant-bubble-content-wrapper) {
  width: 100%;
}

:global(.debug-bubble-content--empty) {
  display: none;
}

:global(.debug-bubble-content--status) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0 !important;
  line-height: 1.8rem !important;
}

:global(.debug-bubble-content--text) {
  width: 100%;
  max-width: 100%;
}

:global(.debug-bubble-content--voice) {
  padding: 0 !important;
  min-height: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

:global(.app-orchestration__preview .ant-bubble-header) {
  margin-bottom: var(--chat-bubble-adjacent-gap);
}

:global(.app-orchestration__preview .ant-bubble-footer) {
  margin-top: var(--chat-bubble-adjacent-gap);
}

:global(.voice-message-row) {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  max-width: min(28rem, 100%);
}

:global(.voice-message-row--user) {
  justify-content: flex-end;
}

:global(.voice-bubble) {
  display: flex;
  align-items: center;
  width: 18rem;
  min-width: 18rem;
  max-width: 18rem;
  height: 4rem;
  gap: 0.45rem;
  padding: 0 0.95rem;
  color: #111827;
  background: #f1f2f4;
  border: 0;
  border-radius: 0.8rem;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

:global(.voice-bubble:hover),
:global(.voice-bubble:focus-visible) {
  background: #e9eaee;
  outline: 0;
}

:global(.voice-bubble__wave) {
  --voice-progress: 0%;

  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  height: 2.4rem;
  min-width: 0;
}

:global(.voice-bubble__wave-layer) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  pointer-events: none;
}

:global(.voice-bubble__wave-layer--progress) {
  clip-path: inset(0 calc(100% - var(--voice-progress)) 0 0);
  will-change: clip-path;
}

:global(.voice-bubble__wave-layer span) {
  display: block;
  width: 0.34rem;
  flex: 0 0 0.34rem;
  background-color: #d1d5db;
  border-radius: 999px;
  transition: height 0.16s ease;
}

:global(.voice-bubble__wave-layer--progress span) {
  background-color: #4b5563;
}

:global(.voice-bubble__wave-layer span.is-loading) {
  animation: voice-wave-loading 1.05s ease-in-out infinite;
}

:global(.voice-bubble__meta) {
  flex: 0 0 5.2rem;
  overflow: hidden;
  color: #111827;
  font-size: 1.3rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.8rem;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    opacity 0.16s ease;
}

:global(.voice-bubble__meta.is-empty) {
  opacity: 0;
}

:global(.voice-bubble__meta:not(.is-empty)) {
  opacity: 1;
}

:global(.voice-bubble__meta:not(:empty)) {
  color: #111827;
}

:global(.voice-bubble__meta.is-status) {
  color: #4b5563;
}

:global(.voice-message-row audio) {
  display: none;
}

:global(.processing-status) {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: min(32rem, 100%);
  gap: 0.4rem;
  color: #4b5563;
  font-size: 1.3rem;
  line-height: 1.8rem;
}

:global(.processing-status > span:first-child) {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
}

:global(.processing-status__dots) {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  gap: 0.25rem;
}

:global(.processing-status__dots i) {
  width: 0.3rem;
  height: 0.3rem;
  background: #9ca3af;
  border-radius: 50%;
  animation: status-dot 1.1s ease-in-out infinite;
}

:global(.processing-status__dots i:nth-child(2)) {
  animation-delay: 0.14s;
}

:global(.processing-status__dots i:nth-child(3)) {
  animation-delay: 0.28s;
}

.voice-record-button__loading {
  animation: voice-spin 0.9s linear infinite;
}

:global(.transcript-bubble) {
  max-width: min(38rem, 100%);
  padding: 0.8rem 1.1rem;
  color: var(--color-text);
  background: #f1f2f4;
  border-radius: 0.8rem;
}

:global(.transcript-bubble--user) {
  justify-self: end;
}

.voice-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 9.6rem;
  padding: 0.4rem;
  background: #fff;
  border: 0.1rem solid #e5e7eb;
  border-radius: 0.8rem;
  box-shadow:
    0 1.2rem 3rem rgb(15 23 42 / 12%),
    0 0.2rem 0.8rem rgb(15 23 42 / 8%);
}

.voice-context-menu button {
  display: block;
  width: 100%;
  min-height: 3.2rem;
  padding: 0 1rem;
  color: #111827;
  font: inherit;
  font-size: 1.3rem;
  line-height: 1.8rem;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 0.6rem;
  cursor: pointer;
}

.voice-context-menu button:hover,
.voice-context-menu button:focus-visible {
  background: #f3f4f6;
  outline: 0;
}

.voice-record-button.is-recording {
  color: #dc2626;
  background: rgb(220 38 38 / 10%);
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

@keyframes voice-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes voice-wave-loading {
  0%,
  100% {
    opacity: 0.42;
    transform: scaleY(0.65);
  }
  50% {
    opacity: 1;
    transform: scaleY(1.08);
  }
}

@keyframes status-enter {
  from {
    opacity: 0;
    transform: translateY(0.3rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes status-dot {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-0.2rem);
  }
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
  display: block;
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
  padding: 1.3rem 1.5rem;
  overflow-x: auto;
  color: #d4d4d4;
  background: #1e1e1e;
  border: 0.1rem solid #3c3c3c;
  border-radius: 0.8rem;
  box-shadow: inset 0 0.1rem 0 rgba(255, 255, 255, 0.04);
  scrollbar-color: #5f5f5f transparent;
}

:global(.chat-markdown pre.shiki) {
  background-color: #1e1e1e !important;
}

:global(.chat-markdown pre code) {
  display: block;
  padding: 0;
  color: inherit;
  font-size: 1.24rem;
  line-height: 2rem;
  background: transparent;
  border-radius: 0;
  white-space: pre;
}

:global(.chat-markdown pre code .line) {
  display: inline-block;
  min-height: 2rem;
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

:global(.chat-message-header--user) {
  justify-items: end;
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

:global(.chat-message-header--user .chat-message-attachments) {
  justify-items: end;
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
  margin: 0;
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
