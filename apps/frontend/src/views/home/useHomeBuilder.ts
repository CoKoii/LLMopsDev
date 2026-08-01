import {
  createAiAppApi,
  createPluginApi,
  streamHomeBuilderPlanApi,
  updateAiAppDraftApi,
  type AiAppVersionConfig,
  type HomeBuilderHistoryMessage,
  type HomeBuilderPlan,
} from '@/api'
import { message } from 'antdv-next'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { Router } from 'vue-router'

export type HomeBuilderMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  plan?: HomeBuilderPlan
  pending?: boolean
  statusText?: string
}

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
type ScrollToBottom = (force?: boolean) => Promise<void> | void
const input = ref('')
const loading = ref(false)
const messages = ref<HomeBuilderMessage[]>([])
const pendingPlan = ref<HomeBuilderPlan>()
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

function hasCreatableResource(plan?: HomeBuilderPlan) {
  return Boolean(
    plan &&
      ((plan.intent === 'create_app' && plan.app) || (plan.intent === 'create_plugin' && plan.plugin)),
  )
}

function shouldKeepPendingPlan(plan?: HomeBuilderPlan) {
  return Boolean(
    plan && hasCreatableResource(plan) && (plan.action === 'draft' || plan.action === 'clarify'),
  )
}

function buildAppDraftConfig(plan: HomeBuilderPlan): AiAppVersionConfig {
  const app = plan.app
  if (!app) return {}

  return {
    prompt: app.prompt,
    llmId: app.llmId ?? null,
    modelSettings: {
      temperature: app.modelSettings.temperature,
      topP: app.modelSettings.topP,
      presencePenalty: app.modelSettings.presencePenalty,
      frequencyPenalty: app.modelSettings.frequencyPenalty,
      contextRounds: app.modelSettings.contextRounds,
    },
    capabilities: [],
    pluginIds: app.pluginIds,
    pluginSettings: {},
    knowledge: {
      ids: app.knowledgeIds,
      settings: {
        strategy: 'hybrid',
        limit: app.knowledgeIds.length ? 10 : 6,
        minScore: 0.2,
        vectorWeight: 0.7,
      },
    },
    toggles: {
      longTermMemory: Boolean(app.toggles.longTermMemory),
      questionSuggestions: app.toggles.questionSuggestions ?? true,
      voiceInput: Boolean(app.toggles.voiceInput),
      voiceOutput: Boolean(app.toggles.voiceOutput),
    },
    openingStatement: app.openingStatement,
  }
}

export function useHomeBuilder(router: Router) {
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

    input.value = ''
    messages.value.push({
      id: createId(),
      role: 'user',
      content,
    })

    await requestBuilderPlan(content, scroll)
  }

  async function requestBuilderPlan(content: string, scroll?: ScrollToBottom) {
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
    let plan: HomeBuilderPlan | undefined
    const currentPendingPlan = pendingPlan.value

    try {
      await streamHomeBuilderPlanApi({
        message: content,
        history: toHistory(messages.value),
        pendingPlan: currentPendingPlan,
        signal: abortController.signal,
        onContent: async (chunk) => {
          assistantContent += chunk
          updateMessage(pendingId, {
            content: assistantContent,
            statusText: undefined,
          })
          await scrollToBottom(scroll, false)
        },
        onPlan: (nextPlan) => {
          plan = nextPlan
          updateMessage(pendingId, {
            content: nextPlan.reply,
            plan: nextPlan,
            statusText: undefined,
          })
        },
        onError: (errorMessage) => {
          streamFailed = true
          pendingPlan.value = undefined
          updateMessage(pendingId, {
            content: `方案生成遇到问题：${errorMessage}`,
            pending: false,
            statusText: undefined,
          })
        },
      })

      if (!streamFailed && plan) {
        if (plan.action === 'create' && hasCreatableResource(plan)) {
          await createConfirmedPlan(plan, pendingId, scroll)
          return
        }

        pendingPlan.value = shouldKeepPendingPlan(plan) ? plan : currentPendingPlan
      }
      updateMessage(pendingId, { pending: false, statusText: undefined })
    } catch (error) {
      pendingPlan.value = undefined
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateMessage(pendingId, {
          content:
            assistantContent ||
            (abortReason === 'timeout' ? '这次构建响应超时了，请稍后重试。' : '已停止响应'),
          pending: false,
          statusText: undefined,
        })
        return
      }
      const errorMessage = error instanceof Error ? error.message : '方案生成失败'
      updateMessage(pendingId, {
        content: `方案生成遇到问题：${errorMessage}`,
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

  async function createConfirmedPlan(
    plan: HomeBuilderPlan,
    messageId: string,
    scroll?: ScrollToBottom,
  ) {
    updateMessage(messageId, {
      pending: true,
      statusText: plan.intent === 'create_plugin' ? '正在创建插件' : '正在创建 AI 应用',
    })
    await scrollToBottom(scroll)

    try {
      if (plan.intent === 'create_app' && plan.app) {
        await createAppFromPlan(plan)
        updateMessage(messageId, {
          content: `已按确认的方案创建“${plan.app.name}”，正在进入编排页。`,
          pending: false,
          statusText: undefined,
        })
        pendingPlan.value = undefined
        return
      }

      if (plan.intent === 'create_plugin' && plan.plugin) {
        await createPluginFromPlan(plan)
        updateMessage(messageId, {
          content: `已按确认的方案创建插件“${plan.plugin.name}”。`,
          pending: false,
          statusText: undefined,
        })
        pendingPlan.value = undefined
        return
      }

      updateMessage(messageId, {
        content: '当前没有可创建的方案，请先告诉我你想创建什么。',
        pending: false,
        statusText: undefined,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建失败'
      updateMessage(messageId, {
        content: `创建遇到问题：${errorMessage}`,
        pending: false,
        statusText: undefined,
      })
    }
  }

  async function createAppFromPlan(plan: HomeBuilderPlan) {
    const app = plan.app
    if (!app?.categoryId) {
      throw new Error('方案缺少应用分类，请补充后再创建')
    }

    const created = await createAiAppApi({
      name: app.name,
      categoryId: app.categoryId,
      description: app.description,
      status: true,
    })
    if (!created.app?.id) {
      throw new Error('应用已创建，但没有返回应用 ID')
    }
    await updateAiAppDraftApi(created.app.id, {
      config: buildAppDraftConfig(plan),
    })
    message.success('AI 应用已创建，已进入编排页')
    await router.push({
      name: 'app-orchestration',
      params: { appId: created.app.id, page: 'edit' },
    })
  }

  async function createPluginFromPlan(plan: HomeBuilderPlan) {
    const plugin = plan.plugin
    if (!plugin?.categoryId) {
      throw new Error('方案缺少插件分类，请补充后再创建')
    }
    if (plugin.needsMoreInfo || !plugin.openapiSchema.trim()) {
      throw new Error('插件接口信息还不完整，请继续补充接口地址、方法、鉴权和参数')
    }

    await createPluginApi({
      name: plugin.name,
      description: plugin.description,
      categoryId: plugin.categoryId,
      openapiSchema: plugin.openapiSchema,
      headers: plugin.headers,
      status: true,
      published: plugin.published,
    })
    message.success('插件已创建')
    await router.push({ name: 'personal-space-plugins' })
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
