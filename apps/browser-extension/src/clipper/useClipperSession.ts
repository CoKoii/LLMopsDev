import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  cleanWebClipApi,
  createKnowledgeDocumentApi,
  getKnowledgeDocumentApi,
  getUserProfileApi,
  listKnowledgeApi,
  loginApi,
  uploadFileApi,
} from '../api'
import {
  clearAuth as clearStoredAuth,
  clearLatestClip,
  loadAuth,
  loadSettings,
  saveAuth,
  saveSettings,
} from '../storage'
import type {
  AuthState,
  ClipSettings,
  KnowledgeItem,
  UserProfile,
  WebClipPayload,
} from '../types'
import {
  hasDocumentFailed,
  isDocumentReady,
  resolveDocumentFailure,
  resolveDocumentProgress,
} from './documentProgress'
import { CLIPPER_EVENTS, dispatchStartPicking } from './messages'

export type ModalView = 'clip' | 'login'
export type StatusTone = 'idle' | 'success' | 'warning' | 'error'
export type WorkbenchStage =
  | 'empty'
  | 'captured'
  | 'cleaning'
  | 'cleaned'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'

export interface UploadItem {
  id: number
  name: string
  size: number
  status: 'uploading' | 'creating' | 'processing' | 'completed' | 'failed'
  message: string
}

interface PageScrollSnapshot {
  bodyOverflow: string
  bodyOverscrollBehavior: string
  documentOverflow: string
  documentOverscrollBehavior: string
}

let pageScrollSnapshot: PageScrollSnapshot | undefined

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

const sanitizeFilename = (value: string) =>
  `${value || 'web-clip'}`
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'web-clip'

const formatAccount = (profile?: UserProfile, auth?: AuthState) =>
  profile?.nickname || profile?.username || auth?.username || '已登录'

const lockPageScroll = () => {
  if (pageScrollSnapshot) return

  pageScrollSnapshot = {
    bodyOverflow: document.body.style.overflow,
    bodyOverscrollBehavior: document.body.style.overscrollBehavior,
    documentOverflow: document.documentElement.style.overflow,
    documentOverscrollBehavior: document.documentElement.style.overscrollBehavior,
  }
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehavior = 'contain'
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.overscrollBehavior = 'contain'
}

const unlockPageScroll = () => {
  if (!pageScrollSnapshot) return

  document.body.style.overflow = pageScrollSnapshot.bodyOverflow
  document.body.style.overscrollBehavior = pageScrollSnapshot.bodyOverscrollBehavior
  document.documentElement.style.overflow = pageScrollSnapshot.documentOverflow
  document.documentElement.style.overscrollBehavior = pageScrollSnapshot.documentOverscrollBehavior
  pageScrollSnapshot = undefined
}

export const useClipperSession = () => {
  const settings = reactive<ClipSettings>({})
  const auth = ref<AuthState>()
  const profile = ref<UserProfile>()
  const clip = ref<WebClipPayload>()
  const sourceMarkdown = ref('')
  const cleanedMarkdown = ref('')
  const knowledges = ref<KnowledgeItem[]>([])
  const modalOpen = ref(false)
  const modalView = ref<ModalView>('clip')
  const loadingKnowledges = ref(false)
  const loggingIn = ref(false)
  const cleaning = ref(false)
  const uploading = ref(false)
  const processing = ref(false)
  const uploadItem = ref<UploadItem>()
  const status = reactive({
    tone: 'idle' as StatusTone,
    text: '',
  })
  const loginForm = reactive({
    username: '',
    password: '',
  })
  let disposed = false

  const isAuthed = computed(() => Boolean(auth.value?.accessToken))
  const accountLabel = computed(() =>
    isAuthed.value ? formatAccount(profile.value, auth.value) : '登录 LLMops',
  )
  const clipTitle = computed(() => clip.value?.title || '未命名网页剪藏')
  const hasCleanedMarkdown = computed(() => Boolean(cleanedMarkdown.value.trim()))
  const uploadMarkdown = computed(
    () => cleanedMarkdown.value.trim() || sourceMarkdown.value.trim() || clip.value?.markdown.trim() || '',
  )
  const selectedKnowledge = computed(() =>
    knowledges.value.find((item) => item.id === settings.knowledgeId),
  )
  const stage = computed<WorkbenchStage>(() => {
    if (uploadItem.value?.status === 'completed') return 'completed'
    if (uploadItem.value?.status === 'failed') return 'failed'
    if (processing.value) return 'processing'
    if (uploading.value) return 'uploading'
    if (cleaning.value) return 'cleaning'
    if (hasCleanedMarkdown.value) return 'cleaned'
    if (clip.value) return 'captured'
    return 'empty'
  })
  const uploadCompleted = computed(() => uploadItem.value?.status === 'completed')
  const canClean = computed(() =>
    Boolean(clip.value && !uploadCompleted.value && !cleaning.value && !uploading.value && !processing.value),
  )
  const canUpload = computed(() =>
    Boolean(
      clip.value &&
        uploadMarkdown.value &&
        settings.knowledgeId &&
        !uploadCompleted.value &&
        !cleaning.value &&
        !uploading.value &&
        !processing.value,
    ),
  )

  const setStatus = (text: string, tone: StatusTone = 'idle') => {
    status.text = text
    status.tone = tone
  }

  const createContext = () => ({
    settings,
    auth: auth.value,
    updateAuth: async (nextAuth: AuthState) => {
      auth.value = nextAuth
      await saveAuth(nextAuth)
    },
    clearAuth: async () => {
      auth.value = undefined
      profile.value = undefined
      await clearStoredAuth()
    },
  })

  const persistSettings = async () => {
    await saveSettings({
      knowledgeId: settings.knowledgeId,
    })
  }

  const requireAuth = () => {
    if (isAuthed.value) return true

    modalView.value = 'login'
    modalOpen.value = true
    return false
  }

  const setClip = (nextClip?: WebClipPayload) => {
    clip.value = nextClip
    sourceMarkdown.value = nextClip?.markdown || ''
    cleanedMarkdown.value = ''
    uploadItem.value = undefined
    uploading.value = false
    processing.value = false
  }

  const openModal = () => {
    modalView.value = isAuthed.value ? 'clip' : 'login'
    modalOpen.value = true
  }

  const closeModal = () => {
    modalOpen.value = false
    setClip()
    setStatus('')
    void clearLatestClip()
  }

  const startPicking = () => {
    modalOpen.value = false
    setStatus('')
    dispatchStartPicking()
  }

  const loadProfile = async () => {
    if (!auth.value) return
    profile.value = await getUserProfileApi(createContext())
  }

  const loadKnowledges = async () => {
    if (!auth.value) return

    loadingKnowledges.value = true
    try {
      const result = await listKnowledgeApi(createContext())
      knowledges.value = result.items.filter((item) => item.status)

      if (
        settings.knowledgeId &&
        !knowledges.value.some((item) => item.id === settings.knowledgeId)
      ) {
        settings.knowledgeId = undefined
      }
      if (!settings.knowledgeId && knowledges.value[0]) {
        settings.knowledgeId = knowledges.value[0].id
      }
      await persistSettings()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '知识库加载失败', 'error')
    } finally {
      loadingKnowledges.value = false
    }
  }

  const initializeAuthedState = async () => {
    if (!auth.value) return

    try {
      await loadProfile()
      await loadKnowledges()
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        auth.value = undefined
        profile.value = undefined
        await clearStoredAuth()
      } else {
        setStatus(error instanceof Error ? error.message : '初始化失败', 'error')
      }
    }
  }

  const submitLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password) {
      setStatus('请输入账号和密码', 'warning')
      return
    }

    loggingIn.value = true
    try {
      const tokens = await loginApi(settings, {
        username: loginForm.username.trim(),
        password: loginForm.password,
      })
      auth.value = {
        ...tokens,
        username: loginForm.username.trim(),
      }
      await saveAuth(auth.value)
      loginForm.password = ''
      await initializeAuthedState()
      modalView.value = 'clip'
      setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '登录失败', 'error')
    } finally {
      loggingIn.value = false
    }
  }

  const saveKnowledge = async () => {
    await persistSettings()
  }

  const cleanClip = async () => {
    if (!requireAuth()) return
    if (!clip.value) {
      setStatus('请先选择网页区域', 'warning')
      return
    }

    cleaning.value = true
    cleanedMarkdown.value = ''
    uploadItem.value = undefined
    try {
      const result = await cleanWebClipApi(createContext(), clip.value)
      cleanedMarkdown.value = result.markdown.trim()
      setStatus(result.cleanedBy === 'rule' ? '已生成基础整理结果' : '清洗完成', 'success')
    } catch {
      setStatus('清洗暂不可用，可直接上传原始内容', 'warning')
    } finally {
      cleaning.value = false
    }
  }

  const pollDocumentProgress = async (knowledgeId: number, documentId: number, item: UploadItem) => {
    processing.value = true
    while (!disposed) {
      const document = await getKnowledgeDocumentApi(createContext(), knowledgeId, documentId)
      if (disposed) return

      item.status = 'processing'
      item.message = resolveDocumentProgress(document)

      if (hasDocumentFailed(document)) {
        item.status = 'failed'
        item.message = resolveDocumentFailure(document)
        processing.value = false
        setStatus(item.message, 'error')
        return
      }

      if (isDocumentReady(document)) {
        item.status = 'completed'
        item.message = '处理完成'
        processing.value = false
        setStatus('处理完成，可在知识库中检索', 'success')
        return
      }

      setStatus(item.message, 'idle')
      await wait(1200)
    }
  }

  const uploadClip = async () => {
    if (!requireAuth()) return
    if (uploadCompleted.value) {
      setStatus('已上传，请重新剪藏其他内容', 'success')
      return
    }
    if (!clip.value) {
      setStatus('请先选择网页区域', 'warning')
      return
    }
    if (!settings.knowledgeId) {
      setStatus('请选择知识库', 'warning')
      return
    }
    const markdown = uploadMarkdown.value
    if (!markdown) {
      setStatus('未读取到可上传内容，请重新选择区域', 'warning')
      return
    }

    const context = createContext()
    const filename = `${sanitizeFilename(clipTitle.value)}.md`
    const file = new File([markdown], filename, { type: 'text/markdown' })
    const item: UploadItem = {
      id: Date.now(),
      name: filename,
      size: file.size,
      status: 'uploading',
      message: '上传中',
    }
    uploadItem.value = item
    uploading.value = true
    setStatus('上传中')

    try {
      const uploadedFile = await uploadFileApi(context, file)
      if (disposed) return

      item.status = 'creating'
      item.message = '创建文档'
      setStatus('创建文档')

      const document = await createKnowledgeDocumentApi(
        context,
        settings.knowledgeId,
        uploadedFile.id,
      )
      if (disposed) return

      item.status = 'processing'
      item.message = resolveDocumentProgress(document)
      uploading.value = false
      await pollDocumentProgress(settings.knowledgeId, document.id, item)
    } catch (error) {
      item.status = 'failed'
      item.message = error instanceof Error ? error.message : '上传失败'
      processing.value = false
      setStatus(item.message, 'error')
    } finally {
      uploading.value = false
    }
  }

  const removeClip = async () => {
    await clearLatestClip()
    setClip()
    setStatus('')
  }

  const handleClipCaptured = (event: Event) => {
    const detail = (event as CustomEvent<WebClipPayload>).detail
    setClip(detail)
    modalView.value = isAuthed.value ? 'clip' : 'login'
    modalOpen.value = true
    setStatus(detail ? '已采集，可直接上传或先清洗' : '', detail ? 'success' : 'idle')
  }

  const handleTogglePanel = () => {
    if (modalOpen.value) {
      closeModal()
      return
    }

    modalView.value = isAuthed.value ? 'clip' : 'login'
    modalOpen.value = true
  }

  watch(
    modalOpen,
    (open) => {
      if (open) {
        lockPageScroll()
        return
      }
      unlockPageScroll()
    },
    { flush: 'sync' },
  )

  onMounted(async () => {
    window.addEventListener(CLIPPER_EVENTS.clipCaptured, handleClipCaptured)
    window.addEventListener(CLIPPER_EVENTS.togglePanel, handleTogglePanel)
    Object.assign(settings, await loadSettings())
    auth.value = await loadAuth()
    loginForm.username = auth.value?.username || ''
    setClip()
    await clearLatestClip()
    await initializeAuthedState()
  })

  onUnmounted(() => {
    disposed = true
    unlockPageScroll()
    window.removeEventListener(CLIPPER_EVENTS.clipCaptured, handleClipCaptured)
    window.removeEventListener(CLIPPER_EVENTS.togglePanel, handleTogglePanel)
  })

  return {
    accountLabel,
    auth,
    canClean,
    canUpload,
    cleanClip,
    cleanedMarkdown,
    cleaning,
    clip,
    clipTitle,
    closeModal,
    hasCleanedMarkdown,
    isAuthed,
    knowledges,
    loadingKnowledges,
    loadKnowledges,
    loggingIn,
    loginForm,
    modalOpen,
    modalView,
    openModal,
    processing,
    removeClip,
    saveKnowledge,
    selectedKnowledge,
    settings,
    sourceMarkdown,
    stage,
    startPicking,
    status,
    submitLogin,
    uploadClip,
    uploading,
    uploadItem,
  }
}
