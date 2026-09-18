import {
  streamAiAppDebugApi,
  transcribeAiAppSpeechApi,
  uploadFileApi,
  type UploadedFile,
} from '@/api'
import { useAppDebugStore, type AppDebugAttachment } from '@/stores/appDebug'
import { message as notify } from 'antdv-next'
import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue'

type AppChatStreamApi = (
  params: Omit<Parameters<typeof streamAiAppDebugApi>[0], 'endpoint'>,
) => ReturnType<typeof streamAiAppDebugApi>

type SessionOptions = {
  voiceOutputEnabled?: () => boolean
  streamApi?: AppChatStreamApi
  transcribeApi?: typeof transcribeAiAppSpeechApi
  storeKey?: Ref<number> | (() => number)
  onSession?: (sessionId: number) => void
}

type AssistantResponseOptions = {
  attachmentFileIds?: number[]
  key: number
  userMessageKey: string
}

export type DebugComposerAttachment = AppDebugAttachment & {
  status: 'uploading' | 'done' | 'error'
  error?: string
}

type UploadFileWithUid = File & {
  uid?: string
}

type StreamingAudioSink = {
  append: (base64: string, contentType: string) => void
  finish: () => void
  fail: () => void
}

type ApiErrorLike = {
  message?: unknown
  response?: {
    data?: {
      message?: unknown
    }
  }
}

const emptyTranscriptionPatterns = [
  '未识别',
  '未返回识别文本',
  '返回内容为空',
  'no speech',
  'no transcription',
  'empty transcription',
  'silent audio',
  'audio is silent',
  'asr_response_have_no_words',
  'have_no_words',
  'no_words',
  'no words',
]

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return fallback

  const apiError = error as ApiErrorLike
  const responseMessage = apiError.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage
  }
  if (typeof apiError.message === 'string' && apiError.message.trim()) {
    return apiError.message
  }
  return fallback
}

const isEmptyTranscriptionError = (error: unknown) => {
  const message = getErrorMessage(error, '').toLowerCase()
  return emptyTranscriptionPatterns.some((pattern) => message.includes(pattern.toLowerCase()))
}

const base64ToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = window.atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const createStreamingAudioSink = (
  contentType: string,
  onUrl: (url: string) => void,
): StreamingAudioSink => {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const createBlobUrl = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: contentType }))
    onUrl(url)
  }

  if (!('MediaSource' in window) || !MediaSource.isTypeSupported(contentType)) {
    return {
      append: (base64) => {
        chunks.push(base64ToUint8Array(base64))
      },
      finish: createBlobUrl,
      fail: () => undefined,
    }
  }

  const mediaSource = new MediaSource()
  const streamUrl = URL.createObjectURL(mediaSource)
  const pending: Uint8Array<ArrayBuffer>[] = []
  let sourceBuffer: SourceBuffer | undefined
  let finished = false
  let failed = false
  onUrl(streamUrl)

  const appendNext = () => {
    if (!sourceBuffer || sourceBuffer.updating) return
    const chunk = pending.shift()
    if (chunk) {
      sourceBuffer.appendBuffer(chunk)
      return
    }
    if (finished && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream()
      } catch {
        // The media element may have been detached while the stream was ending.
      }
    }
  }

  mediaSource.addEventListener(
    'sourceopen',
    () => {
      if (failed) return
      try {
        sourceBuffer = mediaSource.addSourceBuffer(contentType)
        sourceBuffer.mode = 'sequence'
        sourceBuffer.addEventListener('updateend', appendNext)
        appendNext()
      } catch {
        failed = true
        createBlobUrl()
      }
    },
    { once: true },
  )

  return {
    append: (base64) => {
      const chunk = base64ToUint8Array(base64)
      chunks.push(chunk)
      if (failed) return
      pending.push(chunk)
      appendNext()
    },
    finish: () => {
      finished = true
      createBlobUrl()
      if (failed) {
        return
      }
      appendNext()
    },
    fail: () => {
      failed = true
      pending.length = 0
    },
  }
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
  options: SessionOptions = {},
) {
  const debugStore = useAppDebugStore()
  const senderValue = ref('')
  const attachments = ref<DebugComposerAttachment[]>([])
  const responding = ref(false)
  const transcribingVoice = ref(false)
  let debugAbortController: AbortController | undefined
  let activeAudioSink: StreamingAudioSink | undefined
  const streamApi = options.streamApi ?? streamAiAppDebugApi
  const transcribeApi = options.transcribeApi ?? transcribeAiAppSpeechApi
  const getStoreKey = () => {
    const key = options.storeKey
    if (typeof key === 'function') return key()
    return key?.value ?? appId.value
  }

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

  const runAssistantResponse = async (
    content: string,
    scrollToBottom: (force?: boolean) => Promise<void>,
    responseOptions: AssistantResponseOptions,
  ) => {
    const { attachmentFileIds = [], key, userMessageKey } = responseOptions
    const storeKey = getStoreKey()
    const assistantKey = `a-${key}`
    const updateAssistant = (patch: Parameters<typeof debugStore.updateMessage>[2]) =>
      debugStore.updateMessage(storeKey, assistantKey, patch)
    const assistantAsAudio = Boolean(options.voiceOutputEnabled?.())
    debugStore.setSuggestions(storeKey, [])
    debugStore.pushMessage(storeKey, {
      key: assistantKey,
      role: 'assistant',
      content: '',
      pending: true,
      audioGenerating: assistantAsAudio,
      audioMessage: assistantAsAudio,
      audioTextVisible: false,
      statusText: '准备回复中',
    })
    responding.value = true
    let streamFailed = false
    let assistantContent = ''
    let audioSink: StreamingAudioSink | undefined
    const ensureAudioSink = (contentType: string) => {
      if (audioSink) return audioSink
      audioSink = createStreamingAudioSink(contentType, (audioUrl) => {
        updateAssistant({
          audioUrl,
          audioGenerating: false,
          audioMessage: true,
          statusText: undefined,
        })
      })
      activeAudioSink = audioSink
      return audioSink
    }
    await scrollToBottom(true)

    try {
      await saveDraftNow()
      debugAbortController = new AbortController()
      await streamApi({
        appId: appId.value,
        sessionId: debugStore.getSessionId(storeKey),
        message: content,
        attachmentFileIds,
        signal: debugAbortController.signal,
        onSession: ({ sessionId, userMessageId, assistantMessageId }) => {
          debugStore.setSessionId(storeKey, sessionId)
          debugStore.updateMessage(storeKey, userMessageKey, { id: userMessageId })
          updateAssistant({ id: assistantMessageId })
          options.onSession?.(sessionId)
        },
        onContent: async (chunk) => {
          assistantContent += chunk
          updateAssistant({
            content: assistantContent,
            ...(!assistantAsAudio ? { statusText: undefined } : {}),
          })
          if (!assistantAsAudio) await scrollToBottom(false)
        },
        onAudioStart: ({ contentType }) => {
          if (!assistantAsAudio) return
          ensureAudioSink(contentType)
          updateAssistant({
            audioGenerating: false,
            audioMessage: true,
            statusText: undefined,
          })
        },
        onAudioChunk: async ({ contentType, data }) => {
          if (!assistantAsAudio) return
          ensureAudioSink(contentType).append(data, contentType)
          updateAssistant({
            audioGenerating: false,
            audioMessage: true,
            statusText: undefined,
          })
          await scrollToBottom(false)
        },
        onAudioEnd: () => {
          audioSink?.finish()
          updateAssistant({
            audioGenerating: false,
            audioMessage: assistantAsAudio,
            statusText: undefined,
          })
          activeAudioSink = undefined
        },
        onAudioError: (message) => {
          audioSink?.fail()
          activeAudioSink = undefined
          updateAssistant({
            audioGenerating: false,
            statusText: undefined,
          })
          notify.warning(message || '语音合成失败，已保留文字回复')
        },
        onMeta: (meta) => {
          updateAssistant({
            pending: false,
            elapsedMs: meta.elapsedMs,
            tokens: meta.tokens,
            statusText: assistantAsAudio && !audioSink ? '等待语音' : undefined,
          })
        },
        onStatus: async (status) => {
          if (!assistantAsAudio && assistantContent.trim()) return
          updateAssistant({ statusText: status })
          await scrollToBottom(false)
        },
        onKnowledge: ({ query, items }) => {
          updateAssistant({
            knowledgeQuery: query,
            knowledgeCitations: items,
            statusText: undefined,
          })
        },
        onAttachments: ({ query, items }) => {
          updateAssistant({
            attachmentQuery: query,
            attachmentCitations: items,
            statusText: undefined,
          })
        },
        onSuggestions: (items) => {
          debugStore.setSuggestions(storeKey, items)
        },
        onError: (message) => {
          streamFailed = true
          updateAssistant({
            content: message,
            audioGenerating: false,
            audioMessage: false,
            pending: false,
            statusText: undefined,
          })
          debugStore.setSuggestions(storeKey, [])
        },
      })
      const assistantMessage = debugStore
        .getMessages(storeKey)
        .find((item) => item.key === assistantKey)
      const assistantText = assistantMessage?.content.trim() || assistantContent.trim()
      if (assistantAsAudio && assistantText && !assistantMessage?.content.trim()) {
        updateAssistant({ content: assistantText })
      }
      if (!streamFailed && assistantText) responding.value = false
    } catch (error) {
      audioSink?.fail()
      activeAudioSink = undefined
      if (error instanceof DOMException && error.name === 'AbortError') return
      updateAssistant({
        content: '调试接口请求失败，请稍后重试。',
        audioGenerating: false,
        audioMessage: false,
        pending: false,
        statusText: undefined,
      })
      debugStore.setSuggestions(storeKey, [])
    } finally {
      responding.value = false
      debugAbortController = undefined
      activeAudioSink = undefined
      await scrollToBottom(false)
    }
  }

  const submitMessage = async (
    value: string,
    scrollToBottom: (force?: boolean) => Promise<void>,
  ) => {
    const content = value.trim()
    if (!content || responding.value) return
    if (hasUploadingAttachments()) {
      notify.warning('文件仍在上传中，请稍后发送')
      return
    }

    const key = Date.now()
    const storeKey = getStoreKey()
    const userMessageKey = `u-${key}`
    const readyAttachments = attachments.value.filter((item) => item.status === 'done')
    debugStore.pushMessage(storeKey, {
      key: userMessageKey,
      role: 'user',
      content,
      attachments: readyAttachments,
    })
    senderValue.value = ''
    attachments.value = []
    await runAssistantResponse(content, scrollToBottom, {
      attachmentFileIds: readyAttachments.map((item) => item.fileId),
      key,
      userMessageKey,
    })
  }

  const submitVoiceMessage = async (
    file: File,
    scrollToBottom: (force?: boolean) => Promise<void>,
  ) => {
    if (responding.value || transcribingVoice.value) return

    const key = Date.now()
    const storeKey = getStoreKey()
    const userMessageKey = `u-${key}`
    const audioUrl = URL.createObjectURL(file)
    debugStore.pushMessage(storeKey, {
      key: userMessageKey,
      role: 'user',
      content: '',
      audioMessage: true,
      audioTextVisible: false,
      audioTranscribing: true,
      audioUrl,
    })
    await scrollToBottom(true)

    transcribingVoice.value = true
    try {
      const uploaded = await uploadFileApi(file, { suppressErrorNotify: true })
      const result = await transcribeApi(appId.value, uploaded.id)
      const text = result.text.trim()
      if (!text) {
        debugStore.updateMessage(storeKey, userMessageKey, { audioTranscribing: false })
        notify.warning('未识别到语音内容')
        return
      }
      debugStore.updateMessage(storeKey, userMessageKey, {
        content: text,
        audioTranscribing: false,
      })
      await runAssistantResponse(text, scrollToBottom, { key, userMessageKey })
    } catch (error) {
      if (isEmptyTranscriptionError(error)) {
        debugStore.updateMessage(storeKey, userMessageKey, {
          audioTranscribing: false,
        })
        notify.warning('未识别到语音内容')
        return
      }
      const errorMessage = getErrorMessage(error, '语音识别失败')
      debugStore.updateMessage(storeKey, userMessageKey, {
        audioTranscribing: false,
        content: errorMessage,
        audioTextVisible: true,
      })
      notify.error(errorMessage)
    } finally {
      transcribingVoice.value = false
    }
  }

  const stopResponse = () => {
    debugAbortController?.abort()
    activeAudioSink?.fail()
    activeAudioSink = undefined
    responding.value = false
    const storeKey = getStoreKey()
    const last = [...debugStore.getMessages(storeKey)].reverse().find((item) => item.pending)
    if (last) {
      debugStore.updateMessage(storeKey, last.key, {
        pending: false,
        content: last.content || '已停止响应',
        audioGenerating: false,
        statusText: undefined,
      })
    }
  }

  const clearChat = async () => {
    debugStore.clearMessages(getStoreKey())
    attachments.value = []
    await nextTick()
  }

  onBeforeUnmount(() => {
    debugAbortController?.abort()
    activeAudioSink?.fail()
  })

  return {
    debugStore,
    senderValue,
    attachments,
    responding,
    transcribingVoice,
    uploadFiles,
    removeAttachment,
    submitMessage,
    submitVoiceMessage,
    stopResponse,
    clearChat,
  }
}
