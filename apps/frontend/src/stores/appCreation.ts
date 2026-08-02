import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppCreationStore = defineStore('appCreation', () => {
  const requestId = ref(0)

  const requestCreate = () => {
    requestId.value += 1
  }

  const consumeRequest = () => {
    requestId.value = 0
  }

  return { requestId, requestCreate, consumeRequest }
})
