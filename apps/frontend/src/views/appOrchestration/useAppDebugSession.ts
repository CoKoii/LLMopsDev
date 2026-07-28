import { streamAiAppDebugApi, uploadFileApi, type UploadedFile } from '@/api'
import { useAppDebugStore, type AppDebugAttachment } from '@/stores/appDebug'
import { message as notify } from 'antdv-next'
import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue'

type ContextSettings = {
  contextRounds: number
}

export type DebugComposerAttachment = AppDebugAttachment & {
  status: 'uploading' | 'done' | 'error'
  error?: string
}

type UploadFileWithUid = File & {
  uid?: string
}

const toDebugAttachment = (file: UploadedFile, uid: string): DebugComposerAttachment => ({
  uid,
  fileId: file.id,
  name: file.originalName,
  contentType: file.contentType,
  size: file.size,
  url: file.url,
  status: 'done',
})

export function useAppDebugSession(
  appId: Ref<number>,
  saveDraftNow: () => Promise<void>,
  settings: ContextSettings,
) {
  const debugStore = useAppDebugStore()
  const senderValue = ref('')
  const attachments = ref<DebugComposerAttachment[]>([])
  const responding = ref(false)
  let debugAbortController: AbortController | undefined

  const hasUploadingAttachments = () =>
    attachments.value.some((item) => item.status === 'uploading')

  const uploadFiles = (files: UploadFileWithUid[] | FileList) => {
    Array.from(files).forEach((file) => {
      const uploadFile = file as UploadFileWithUid
      const uid =
        uploadFile.uid || `${Date.now()}-${uploadFile.name}-${Math.random().toString(16).slice(2)}`
      attachments.value = [
        ...attachments.value,
        {
          uid,
          fileId: 0,
          name: uploadFile.name,
          contentType: uploadFile.type || 'application/octet-stream',
          size: uploadFile.size,
          status: 'uploading',
        },
      ]
      void uploadFileApi(uploadFile, { suppressErrorNotify: true })
        .then((uploadedFile) => {
          attachments.value = attachments.value.map((item) =>
            item.uid === uid ? toDebugAttachment(uploadedFile, uid) : item,
          )
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : '文件上传失败'
          attachments.value = attachments.value.map((item) =>
            item.uid === uid ? { ...item, status: 'error', error: errorMessage } : item,
          )
          notify.error(errorMessage)
        })
    })
  }

  const removeAttachment = (uid: string) => {
    attachments.value = attachments.value.filter((item) => item.uid !== uid)
  }

  const submitMessage = async (value: string, scrollToBottom: () => Promise<void>) => {
    const content = value.trim()
    if (!content || responding.value) return
    if (hasUploadingAttachments()) {
      notify.warning('文件仍在上传中，请稍后发送')
      return
    }

    const key = Date.now()
    const readyAttachments = attachments.value.filter((item) => item.status === 'done')
    const attachmentFileIds = readyAttachments.map((item) => item.fileId)
    debugStore.setSuggestions(appId.value, [])
    debugStore.pushMessage(appId.value, {
      key: `u-${key}`,
      role: 'user',
      content,
      attachments: readyAttachments,
    })
    debugStore.pushMessage(appId.value, {
      key: `a-${key}`,
      role: 'assistant',
      content: '',
      pending: true,
    })
    senderValue.value = ''
    attachments.value = []
    responding.value = true
    await scrollToBottom()

    try {
      await saveDraftNow()
      debugAbortController = new AbortController()
      await streamAiAppDebugApi({
        appId: appId.value,
        sessionId: debugStore.getSessionId(appId.value),
        message: content,
        attachmentFileIds,
        signal: debugAbortController.signal,
        onSession: ({ sessionId, userMessageId, assistantMessageId }) => {
          debugStore.setSessionId(appId.value, sessionId)
          debugStore.updateMessage(appId.value, `u-${key}`, { id: userMessageId })
          debugStore.updateMessage(appId.value, `a-${key}`, { id: assistantMessageId })
        },
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
        onAttachments: ({ query, items }) => {
          debugStore.updateMessage(appId.value, `a-${key}`, {
            attachmentQuery: query,
            attachmentCitations: items,
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
    attachments.value = []
    await nextTick()
  }

  onBeforeUnmount(() => {
    debugAbortController?.abort()
  })

  return {
    debugStore,
    senderValue,
    attachments,
    responding,
    uploadFiles,
    removeAttachment,
    submitMessage,
    stopResponse,
    clearChat,
  }
}
