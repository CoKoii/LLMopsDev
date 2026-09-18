import {
  streamHomeBuilderApi,
  type HomeBuilderCreatedResource,
  type HomeBuilderHistoryMessage,
} from '@/api'
import { message } from 'antdv-next'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

export type HomeBuilderMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  statusText?: string
}
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
type ScrollToBottom = (force?: boolean) => Promise<void> | void

const input = ref('')
const loading = ref(false)
const messages = ref<HomeBuilderMessage[]>([])
let abortController: AbortController | undefined
let timeoutTimer: ReturnType<typeof window.setTimeout> | undefined
let abortReason: 'timeout' | 'stop' | undefined
const requestTimeoutMs = 60000

function toHistory(messages: HomeBuilderMessage[]): HomeBuilderHistoryMessage[] {
  return messages
    .filter((item) => !item.pending)
    .slice(-8)
    .map((item) => ({
      role: item.role,
      content: item.content,
    }))
}

export function useHomeBuilder() {
  const canSend = computed(() => Boolean(input.value.trim()) && !loading.value)

  function updateMessage(id: string, patch: Partial<HomeBuilderMessage>) {
    messages.value = messages.value.map((item) => (item.id === id ? { ...item, ...patch } : item))
  }

  async function scrollToBottom(scroll?: ScrollToBottom, force = true) {
    await nextTick()
    await scroll?.(force)
  }

  async function sendMessage(scroll?: ScrollToBottom, preset?: string) {
    const content = (preset ?? input.value).trim()
    if (!content || loading.value) return

    const history = toHistory(messages.value)
    input.value = ''
    messages.value.push({
      id: createId(),
      role: 'user',
      content,
    })

    await requestBuilderPlan(content, history, scroll)
  }

  async function requestBuilderPlan(
    content: string,
    history: HomeBuilderHistoryMessage[],
    scroll?: ScrollToBottom,
  ) {
    const pendingId = createId()
    messages.value.push({
      id: pendingId,
      role: 'assistant',
      content: '',
      pending: true,
    })
    await scrollToBottom(scroll)

    loading.value = true
    abortController = new AbortController()
    timeoutTimer = window.setTimeout(() => {
      abortReason = 'timeout'
      abortController?.abort()
    }, requestTimeoutMs)

    let streamFailed = false
    let assistantContent = ''
    let created: HomeBuilderCreatedResource | undefined

    try {
      await streamHomeBuilderApi({
        message: content,
        history,
        signal: abortController.signal,
        onStatus: async (status) => {
          updateMessage(pendingId, { statusText: status })
          await scrollToBottom(scroll, false)
        },
        onContent: async (chunk) => {
          assistantContent += chunk
          updateMessage(pendingId, {
            content: assistantContent,
            statusText: undefined,
          })
          await scrollToBottom(scroll, false)
        },
        onCreated: (nextCreated) => {
          created = nextCreated
        },
        onError: (errorMessage) => {
          streamFailed = true
          updateMessage(pendingId, {
            content: `处理请求时遇到问题：${errorMessage}`,
            pending: false,
            statusText: undefined,
          })
        },
      })

      if (!streamFailed && created) {
        await handleCreatedResource(created)
      }

      updateMessage(pendingId, { pending: false, statusText: undefined })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateMessage(pendingId, {
          content:
            assistantContent ||
            (abortReason === 'timeout' ? '这次响应超时了，请稍后重试。' : '已停止响应。'),
          pending: false,
          statusText: undefined,
        })
        return
      }
      const errorMessage = error instanceof Error ? error.message : '请求处理失败'
      updateMessage(pendingId, {
        content: `处理请求时遇到问题：${errorMessage}`,
        pending: false,
        statusText: undefined,
      })
    } finally {
      if (timeoutTimer) {
        window.clearTimeout(timeoutTimer)
        timeoutTimer = undefined
      }
      loading.value = false
      abortController = undefined
      abortReason = undefined
      await scrollToBottom(scroll, false)
    }
  }

  async function handleCreatedResource(created: HomeBuilderCreatedResource) {
    if (created.type === 'app') {
      message.success(`AI 应用已创建：${created.name}`)
      return
    }

    message.success(`插件已创建：${created.name}`)
  }

  function stopResponse() {
    if (timeoutTimer) {
      window.clearTimeout(timeoutTimer)
      timeoutTimer = undefined
    }
    abortReason = 'stop'
    abortController?.abort()
  }

  onBeforeUnmount(() => {
    if (timeoutTimer) {
      window.clearTimeout(timeoutTimer)
      timeoutTimer = undefined
    }
    abortController?.abort()
  })

  return {
    input,
    loading,
    messages,
    canSend,
    sendMessage,
    stopResponse,
  }
}
