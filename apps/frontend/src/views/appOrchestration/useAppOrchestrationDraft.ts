import {
  getAiAppApi,
  getAiAppDraftApi,
  listAiAppVersionsApi,
  listLlmsApi,
  publishAiAppVersionApi,
  restoreAiAppVersionApi,
  streamAiAppPromptOptimizeApi,
  updateAiAppDraftApi,
  type AppKnowledgeRecallSettings,
  type AiAppItem,
  type AiAppVersionConfig,
  type AiAppVersionItem,
  type LlmItem,
} from '@/api'
import { message } from 'antdv-next'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'

export type CapabilityItem = {
  key: string
  title: string
  description: string
  icon: string
  tone: string
}

export const openingQuestionLimit = 3
export const knowledgeLimit = 5

type AppKnowledgeConfig = {
  ids: number[]
  settings: Record<number, AppKnowledgeRecallSettings>
}

export const configToggles = [
  {
    key: 'longTermMemory',
    title: '长期记忆',
    description: '总结聊天对话的内容，并用于更好的响应用户的消息。',
  },
  {
    key: 'questionSuggestions',
    title: '用户问题建议',
    description: '在应用回复后，自动根据对话内容提供 3 条用户提问建议。',
  },
  {
    key: 'voiceInput',
    title: '语音输入',
    description: '启用后，您可以使用语音输入。',
  },
  {
    key: 'voiceOutput',
    title: '语音输出',
    description: '启用后，应用会将文本回复转换为语音输出。',
  },
] as const

const createInitialCapabilities = (): CapabilityItem[] => [
  {
    key: 'imgUnderstand',
    title: '图片理解 / imgUnderstand',
    description: '回答用户关于图像的问题',
    icon: 'image',
    tone: '#fff7ed',
  },
  {
    key: 'bingWebSearch',
    title: '必应搜索 / bingWebSearch',
    description: '必应搜索引擎。当你需要搜索未知信息，比如天气、汇率、时事时使用。',
    icon: 'globe',
    tone: '#ecfeff',
  },
]

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

export function useAppOrchestrationDraft(appId: Ref<number>) {
  const appDetail = ref<AiAppItem>()
  const appDraft = ref<AiAppVersionItem>()
  const publishedVersions = ref<AiAppVersionItem[]>([])
  const publishedVersionsLoading = ref(false)
  const llms = ref<LlmItem[]>([])
  const promptContent = ref('')
  const selectedLlmId = ref<number | null>(null)
  const capabilities = ref<CapabilityItem[]>(createInitialCapabilities())
  const pluginIds = ref<number[]>([])
  const knowledgeConfig = reactive<AppKnowledgeConfig>({
    ids: [],
    settings: {},
  })
  const openingStatementContent = ref('')
  const openingQuestions = ref<string[]>([''])
  const loading = ref(false)
  const publishing = ref(false)
  const savingDraft = ref(false)
  const optimizingPrompt = ref(false)
  const lastSavedAt = ref<string>()
  const draftReady = ref(false)
  let autoSaveTimer: ReturnType<typeof window.setTimeout> | undefined

  const settings = reactive({
    temperature: 1,
    topP: 0.48,
    presencePenalty: 0.1,
    frequencyPenalty: 0.1,
    contextRounds: 10,
  })
  const toggleSettings = reactive<Record<(typeof configToggles)[number]['key'], boolean>>({
    longTermMemory: false,
    questionSuggestions: false,
    voiceInput: false,
    voiceOutput: false,
  })

  const modelOptions = computed(() =>
    llms.value.map((item) => ({
      label: `${item.provider} · ${item.modelName}`,
      value: item.id,
    })),
  )
  const selectedModelLabel = computed(
    () =>
      modelOptions.value.find((item) => item.value === selectedLlmId.value)?.label || '请选择模型',
  )
  const autoSaveText = computed(() => {
    if (savingDraft.value) return '正在自动保存...'
    return lastSavedAt.value ? `已自动保存 ${formatTime(lastSavedAt.value)}` : '草稿'
  })
  const buildDraftConfig = (): AiAppVersionConfig => {
    const selectedKnowledgeIds = [...new Set(knowledgeConfig.ids)].slice(0, knowledgeLimit)
    const selectedKnowledgeSettings = selectedKnowledgeIds.reduce<
      Record<number, AppKnowledgeRecallSettings>
    >((result, id) => {
      const item = knowledgeConfig.settings[id]
      if (item) {
        result[id] = { ...item }
      }
      return result
    }, {})

    return {
      prompt: promptContent.value,
      llmId: selectedLlmId.value,
      modelSettings: { ...settings },
      capabilities: capabilities.value.map((item) => ({ ...item })),
      workflowIds: [],
      knowledge: {
        ids: selectedKnowledgeIds,
        settings: selectedKnowledgeSettings,
      },
      pluginIds: [...new Set(pluginIds.value)],
      toggles: { ...toggleSettings },
      openingStatement: {
        content: openingStatementContent.value,
        questions: openingQuestions.value
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, openingQuestionLimit),
      },
    }
  }

  const hydrateDraft = (version: AiAppVersionItem) => {
    const config = version.config
    const configKnowledge = config.knowledge ?? {}
    promptContent.value = config.prompt || ''
    selectedLlmId.value = config.llmId ?? null
    Object.assign(settings, {
      temperature: config.modelSettings?.temperature ?? 1,
      topP: config.modelSettings?.topP ?? 0.48,
      presencePenalty: config.modelSettings?.presencePenalty ?? 0.1,
      frequencyPenalty: config.modelSettings?.frequencyPenalty ?? 0.1,
      contextRounds: config.modelSettings?.contextRounds ?? 10,
    })
    capabilities.value = config.capabilities?.length
      ? config.capabilities.map((item) => ({
          key: item.key,
          title: item.title,
          description: item.description || '插件能力',
          icon: item.icon || 'globe',
          tone: item.tone || '#eff6ff',
        }))
      : []
    pluginIds.value = config.pluginIds?.length ? [...new Set(config.pluginIds)] : []
    const nextKnowledgeIds = configKnowledge.ids ?? []
    knowledgeConfig.ids = nextKnowledgeIds.length
      ? [...new Set(nextKnowledgeIds)].slice(0, knowledgeLimit)
      : []
    knowledgeConfig.settings = { ...(configKnowledge.settings ?? {}) }
    openingStatementContent.value = config.openingStatement?.content || ''
    openingQuestions.value = config.openingStatement?.questions?.length
      ? config.openingStatement.questions.slice(0, openingQuestionLimit)
      : ['']
    Object.assign(toggleSettings, {
      longTermMemory: config.toggles?.longTermMemory ?? false,
      questionSuggestions: config.toggles?.questionSuggestions ?? false,
      voiceInput: config.toggles?.voiceInput ?? false,
      voiceOutput: config.toggles?.voiceOutput ?? false,
    })
    appDraft.value = version
    lastSavedAt.value = version.updatedAt
  }

  const saveDraftNow = async () => {
    if (!draftReady.value || !Number.isFinite(appId.value)) return
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer)
      autoSaveTimer = undefined
    }

    savingDraft.value = true
    try {
      appDraft.value = await updateAiAppDraftApi(appId.value, { config: buildDraftConfig() })
      lastSavedAt.value = appDraft.value.updatedAt
    } finally {
      savingDraft.value = false
    }
  }

  const scheduleAutoSave = () => {
    if (!draftReady.value) return
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer)
    }
    autoSaveTimer = window.setTimeout(() => {
      void saveDraftNow()
    }, 600)
  }

  const loadApp = async () => {
    if (!Number.isFinite(appId.value)) return
    loading.value = true
    draftReady.value = false
    try {
      const [app, draft, llmResult] = await Promise.all([
        getAiAppApi(appId.value),
        getAiAppDraftApi(appId.value),
        listLlmsApi({ page: 1, pageSize: 100 }),
      ])
      appDetail.value = app
      llms.value = llmResult.items
      hydrateDraft(draft)
      await nextTick()
      draftReady.value = true
    } catch {
      message.warning('应用详情加载失败，已使用默认内容')
    } finally {
      loading.value = false
    }
  }

  const loadPublishedVersions = async () => {
    if (!Number.isFinite(appId.value)) return
    publishedVersionsLoading.value = true
    try {
      publishedVersions.value = await listAiAppVersionsApi(appId.value)
    } finally {
      publishedVersionsLoading.value = false
    }
  }

  const publishVersion = async () => {
    publishing.value = true
    try {
      await saveDraftNow()
      await publishAiAppVersionApi(appId.value)
      await loadPublishedVersions()
      message.success('版本已保存')
    } finally {
      publishing.value = false
    }
  }

  const restoreVersion = async (versionId: number) => {
    const restored = await restoreAiAppVersionApi(appId.value, versionId)
    draftReady.value = false
    hydrateDraft(restored)
    await nextTick()
    draftReady.value = true
    message.success('已回退到草稿')
  }

  const optimizePrompt = async (
    source: string,
    onContent: (content: string) => void,
    signal?: AbortSignal,
  ) => {
    const prompt = source.trim()
    if (!prompt) {
      message.error('请先填写人设与回复逻辑')
      return
    }

    optimizingPrompt.value = true
    try {
      await saveDraftNow()
      await streamAiAppPromptOptimizeApi({
        appId: appId.value,
        prompt,
        onContent,
        signal,
      })
    } finally {
      optimizingPrompt.value = false
    }
  }

  watch(
    () => buildDraftConfig(),
    () => {
      scheduleAutoSave()
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    if (autoSaveTimer) window.clearTimeout(autoSaveTimer)
  })

  return {
    appDetail,
    appDraft,
    publishedVersions,
    promptContent,
    selectedLlmId,
    capabilities,
    pluginIds,
    knowledgeConfig,
    openingStatementContent,
    openingQuestions,
    settings,
    toggleSettings,
    loading,
    publishing,
    publishedVersionsLoading,
    optimizingPrompt,
    lastSavedAt,
    modelOptions,
    selectedModelLabel,
    autoSaveText,
    loadApp,
    loadPublishedVersions,
    saveDraftNow,
    publishVersion,
    restoreVersion,
    optimizePrompt,
  }
}
