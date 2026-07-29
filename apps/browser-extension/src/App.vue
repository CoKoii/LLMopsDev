<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, MousePointer2, PanelBottom } from '@lucide/vue'

type StatusTone = 'idle' | 'success' | 'error'

const opening = ref(false)
const status = ref('')
const tone = ref<StatusTone>('idle')

const setStatus = (text: string, nextTone: StatusTone = 'idle') => {
  status.value = text
  tone.value = nextTone
}

const getActiveTab = () =>
  new Promise<chrome.tabs.Tab | undefined>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  })

const sendToggleMessage = (tabId: number) =>
  new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'LLMOPS_TOGGLE_PANEL' }, () => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message || '无法打开页面工具'))
        return
      }
      resolve()
    })
  })

const injectContentScript = (tabId: number) =>
  new Promise<void>((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['assets/content.js'],
      },
      () => {
        const error = chrome.runtime.lastError
        if (error) {
          reject(new Error(error.message || '无法注入页面工具'))
          return
        }
        resolve()
      },
    )
  })

const openPageTool = async () => {
  opening.value = true
  try {
    const tab = await getActiveTab()
    if (!tab?.id) {
      setStatus('未找到当前标签页', 'error')
      return
    }

    await sendToggleMessage(tab.id).catch(async () => {
      await injectContentScript(tab.id as number)
      await sendToggleMessage(tab.id as number)
    })
    setStatus('已打开页面工具', 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '打开失败', 'error')
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <main class="popup-shell">
    <header>
      <div class="logo-dot" />
      <div>
        <h1>LLMops Clipper</h1>
        <p>Page Tool</p>
      </div>
    </header>

    <button class="primary-button" type="button" :disabled="opening" @click="openPageTool">
      <PanelBottom v-if="!opening" />
      <MousePointer2 v-else />
      <span>{{ opening ? '打开中' : '打开页面工具' }}</span>
    </button>

    <p class="hint">
      <ExternalLink />
      <span>登录、选择区域、清洗和上传都在当前网页内完成。</span>
    </p>

    <footer v-if="status" :class="tone">{{ status }}</footer>
  </main>
</template>
