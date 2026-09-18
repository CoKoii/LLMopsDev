import type { AuthState, ClipSettings } from './types'

const SETTINGS_KEY = 'llmopsClipperSettings'
const AUTH_KEY = 'llmopsClipperAuth'
const LATEST_CLIP_KEY = 'llmopsLatestClip'

const defaultSettings: ClipSettings = {}

const chromeGet = <T>(keys: string[] | string | Record<string, unknown>) =>
  new Promise<T>((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items as T))
  })

const chromeSet = (items: Record<string, unknown>) =>
  new Promise<void>((resolve) => {
    chrome.storage.local.set(items, () => resolve())
  })

const chromeRemove = (keys: string[] | string) =>
  new Promise<void>((resolve) => {
    chrome.storage.local.remove(keys, () => resolve())
  })

export const loadSettings = async () => {
  const result = await chromeGet<{ [SETTINGS_KEY]?: ClipSettings }>(SETTINGS_KEY)
  return { ...defaultSettings, ...(result[SETTINGS_KEY] ?? {}) }
}

export const saveSettings = async (settings: ClipSettings) => {
  await chromeSet({ [SETTINGS_KEY]: settings })
}

export const loadAuth = async () => {
  const result = await chromeGet<{ [AUTH_KEY]?: AuthState }>(AUTH_KEY)
  return result[AUTH_KEY]
}

export const saveAuth = async (auth: AuthState) => {
  await chromeSet({ [AUTH_KEY]: auth })
}

export const clearAuth = async () => {
  await chromeRemove(AUTH_KEY)
}

export const clearLatestClip = async () => {
  await chromeRemove(LATEST_CLIP_KEY)
}
