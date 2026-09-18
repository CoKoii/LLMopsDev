import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppAttachmentCitation, AppKnowledgeCitation } from '@/api'

export type AppDebugAttachment = {
  uid: string
  fileId: number
  name: string
  contentType: string
  size: number
  url?: string
}

export type AppDebugMessage = {
  key: string
  id?: number
  role: 'user' | 'assistant'
  content: string
  attachments?: AppDebugAttachment[]
  pending?: boolean
  elapsedMs?: number
  tokens?: number
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

export const useAppDebugStore = defineStore('appDebug', () => {
  const sessionIds = ref<Record<number, number | undefined>>({})
  const sessions = ref<Record<number, AppDebugMessage[]>>({})
  const suggestions = ref<Record<number, string[]>>({})

  const getMessages = (appId: number) => {
    sessions.value[appId] ??= []
    return sessions.value[appId]
  }

  const setMessages = (appId: number, messages: AppDebugMessage[]) => {
    sessions.value[appId] = messages
  }

  const pushMessage = (appId: number, message: AppDebugMessage) => {
    sessions.value[appId] = [...getMessages(appId), message]
  }

  const updateMessage = (
    appId: number,
    key: string,
    patch: Partial<Omit<AppDebugMessage, 'key' | 'role'>>,
  ) => {
    sessions.value[appId] = getMessages(appId).map((message) =>
      message.key === key ? { ...message, ...patch } : message,
    )
  }

  const toggleAudioText = (appId: number, key: string) => {
    sessions.value[appId] = getMessages(appId).map((message) =>
      message.key === key ? { ...message, audioTextVisible: !message.audioTextVisible } : message,
    )
  }

  const clearMessages = (appId: number) => {
    sessions.value[appId] = []
    suggestions.value[appId] = []
    sessionIds.value[appId] = undefined
  }

  const getSessionId = (appId: number) => sessionIds.value[appId]

  const setSessionId = (appId: number, sessionId: number) => {
    sessionIds.value[appId] = sessionId
  }

  const getSuggestions = (appId: number) => {
    suggestions.value[appId] ??= []
    return suggestions.value[appId]
  }

  const setSuggestions = (appId: number, items: string[]) => {
    suggestions.value[appId] = items
  }

  return {
    sessions,
    sessionIds,
    suggestions,
    getMessages,
    setMessages,
    pushMessage,
    updateMessage,
    toggleAudioText,
    clearMessages,
    getSessionId,
    setSessionId,
    getSuggestions,
    setSuggestions,
  }
})
