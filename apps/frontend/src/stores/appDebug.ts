import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AppDebugMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  elapsedMs?: number
  tokens?: number
}

export const useAppDebugStore = defineStore('appDebug', () => {
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

  const clearMessages = (appId: number) => {
    sessions.value[appId] = []
    suggestions.value[appId] = []
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
    suggestions,
    getMessages,
    setMessages,
    pushMessage,
    updateMessage,
    clearMessages,
    getSuggestions,
    setSuggestions,
  }
})
