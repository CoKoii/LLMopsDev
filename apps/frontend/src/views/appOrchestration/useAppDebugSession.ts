import { streamAiAppDebugApi } from '@/api'
import { useAppDebugStore } from '@/stores/appDebug'
import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue'

type ContextSettings = {
  contextRounds: number
}

export function useAppDebugSession(
  appId: Ref<number>,
  saveDraftNow: () => Promise<void>,
  settings: ContextSettings,
) {
  const debugStore = useAppDebugStore()
  const senderValue = ref('')
  const responding = ref(false)
  let debugAbortController: AbortController | undefined

  const buildHistory = () => {
    const contextRounds = Math.min(100, Math.max(1, Math.floor(settings.contextRounds || 10)))

    return debugStore
      .getMessages(appId.value)
      .filter((item) => !item.pending && item.content.trim())
      .map((item) => ({
        role: item.role,
        content: item.content.trim(),
      }))
      .slice(-(contextRounds * 2))
  }

  const submitMessage = async (value: string, scrollToBottom: () => Promise<void>) => {
    const content = value.trim()
    if (!content || responding.value) return

    const key = Date.now()
    const history = buildHistory()
    debugStore.setSuggestions(appId.value, [])
    debugStore.pushMessage(appId.value, {
      key: `u-${key}`,
      role: 'user',
      content,
    })
    debugStore.pushMessage(appId.value, {
      key: `a-${key}`,
      role: 'assistant',
      content: '',
      pending: true,
    })
    senderValue.value = ''
    responding.value = true
    await scrollToBottom()

    try {
      await saveDraftNow()
      debugAbortController = new AbortController()
      await streamAiAppDebugApi({
        appId: appId.value,
        message: content,
        history,
        signal: debugAbortController.signal,
        onContent: async (chunk) => {
          const target = debugStore.getMessages(appId.value).find((item) => item.key === `a-${key}`)
          debugStore.updateMessage(appId.value, `a-${key}`, {
            content: `${target?.content || ''}${chunk}`,
          })
          await scrollToBottom()
        },
        onMeta: (meta) => {
          debugStore.updateMessage(appId.value, `a-${key}`, {
            pending: false,
            elapsedMs: meta.elapsedMs,
            tokens: meta.tokens,
          })
        },
        onKnowledge: ({ query, items }) => {
          debugStore.updateMessage(appId.value, `a-${key}`, {
            knowledgeQuery: query,
            knowledgeCitations: items,
          })
        },
        onSuggestions: (items) => {
          debugStore.setSuggestions(appId.value, items)
        },
        onError: (message) => {
          debugStore.updateMessage(appId.value, `a-${key}`, {
            content: message,
            pending: false,
          })
          debugStore.setSuggestions(appId.value, [])
        },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      debugStore.updateMessage(appId.value, `a-${key}`, {
        content: '调试接口请求失败，请稍后重试。',
        pending: false,
      })
      debugStore.setSuggestions(appId.value, [])
    } finally {
      responding.value = false
      debugAbortController = undefined
      await scrollToBottom()
    }
  }

  const stopResponse = () => {
    debugAbortController?.abort()
    responding.value = false
    const last = [...debugStore.getMessages(appId.value)].reverse().find((item) => item.pending)
    if (last) {
      debugStore.updateMessage(appId.value, last.key, {
        pending: false,
        content: last.content || '已停止响应',
      })
    }
  }

  const clearChat = async () => {
    debugStore.clearMessages(appId.value)
    await nextTick()
  }

  onBeforeUnmount(() => {
    debugAbortController?.abort()
  })

  return {
    debugStore,
    senderValue,
    responding,
    submitMessage,
    stopResponse,
    clearChat,
  }
}
