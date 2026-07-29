import type {
  AuthState,
  AuthTokens,
  CleanWebClipResult,
  ClipSettings,
  KnowledgeDocumentItem,
  KnowledgeItem,
  LoginPayload,
  PageResult,
  UploadedFile,
  UploadIntent,
  UserProfile,
  WebClipPayload,
} from './types'

type ApiEnvelope<T> = {
  code: number
  data: T
  message?: string
}

const trimBaseUrl = (value: string) => value.replace(/\/+$/, '')
const apiBaseUrl = trimBaseUrl(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api')

const unwrapResponse = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined

  if (!response.ok) {
    throw new Error(`${response.status}: ${payload?.message || '请求失败'}`)
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data
  }

  return payload as T
}

interface ApiContext {
  settings: ClipSettings
  auth?: AuthState
  updateAuth: (auth: AuthState) => Promise<void>
  clearAuth: () => Promise<void>
}

const rawApiFetch = async <T>(
  _settings: ClipSettings,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })

  return unwrapResponse<T>(response)
}

const authedApiFetch = async <T>(
  context: ApiContext,
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> => {
  if (!context.auth?.accessToken) {
    throw new Error('请先登录')
  }

  try {
    return await rawApiFetch<T>(context.settings, path, init, context.auth.accessToken)
  } catch (error) {
    if (retried || !(error instanceof Error) || !error.message.includes('401')) {
      throw error
    }

    if (!context.auth.refreshToken) {
      await context.clearAuth()
      throw new Error('登录已过期，请重新登录')
    }

    const tokens = await refreshAccessTokenApi(context.settings, context.auth.refreshToken)
    const nextAuth = {
      ...context.auth,
      ...tokens,
    }
    await context.updateAuth(nextAuth)
    context.auth = nextAuth
    return authedApiFetch<T>(context, path, init, true)
  }
}

export const loginApi = (settings: ClipSettings, payload: LoginPayload) =>
  rawApiFetch<AuthTokens>(settings, '/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const refreshAccessTokenApi = (settings: ClipSettings, refreshToken: string) =>
  rawApiFetch<AuthTokens>(
    settings,
    '/auth/refresh',
    {
      method: 'POST',
    },
    refreshToken,
  )

export const getUserProfileApi = (context: ApiContext) =>
  authedApiFetch<UserProfile>(context, '/profiles/me')

export const listKnowledgeApi = (context: ApiContext) =>
  authedApiFetch<PageResult<KnowledgeItem>>(context, '/ai/knowledge?page=1&pageSize=100')

export const cleanWebClipApi = (context: ApiContext, clip: WebClipPayload) =>
  authedApiFetch<CleanWebClipResult>(context, '/ai/knowledge/web-clips/clean', {
    method: 'POST',
    body: JSON.stringify({
      title: clip.title,
      url: clip.url,
      html: clip.html,
      text: clip.text,
      markdown: clip.markdown,
    }),
  })

const createUploadIntentApi = (context: ApiContext, file: File) =>
  authedApiFetch<UploadIntent>(context, '/files/upload-intents', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'text/markdown',
      size: file.size,
    }),
  })

const completeUploadApi = (context: ApiContext, fileId: number) =>
  authedApiFetch<UploadedFile>(context, `/files/${fileId}/complete`, {
    method: 'POST',
  })

export const createKnowledgeDocumentApi = (
  context: ApiContext,
  knowledgeId: number,
  fileId: number,
) =>
  authedApiFetch<KnowledgeDocumentItem>(context, `/ai/knowledge/${knowledgeId}/documents`, {
    method: 'POST',
    body: JSON.stringify({ fileId }),
  })

export const getKnowledgeDocumentApi = (
  context: ApiContext,
  knowledgeId: number,
  documentId: number,
) =>
  authedApiFetch<KnowledgeDocumentItem>(
    context,
    `/ai/knowledge/${knowledgeId}/documents/${documentId}`,
  )

export const uploadFileApi = async (context: ApiContext, file: File) => {
  const intent = await createUploadIntentApi(context, file)
  const response = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: file,
  })

  if (!response.ok) {
    throw new Error('文件上传失败')
  }

  return completeUploadApi(context, intent.file.id)
}
