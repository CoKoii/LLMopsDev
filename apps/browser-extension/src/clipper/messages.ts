import type { WebClipPayload } from '../types'

export const CLIPPER_EVENTS = {
  startPicking: 'llmops-clipper-start-picking',
  clipCaptured: 'llmops-clipper-clip-captured',
  togglePanel: 'llmops-clipper-toggle-panel',
} as const

export const CHROME_MESSAGES = {
  startPicking: 'LLMOPS_START_PICKING',
  togglePanel: 'LLMOPS_TOGGLE_PANEL',
} as const

export type ChromeClipperMessage =
  | { type: typeof CHROME_MESSAGES.startPicking }
  | { type: typeof CHROME_MESSAGES.togglePanel }

export const dispatchStartPicking = () => {
  window.dispatchEvent(new CustomEvent(CLIPPER_EVENTS.startPicking))
}

export const dispatchClipCaptured = (clip: WebClipPayload) => {
  window.dispatchEvent(new CustomEvent<WebClipPayload>(CLIPPER_EVENTS.clipCaptured, { detail: clip }))
}

export const dispatchTogglePanel = () => {
  window.dispatchEvent(new CustomEvent(CLIPPER_EVENTS.togglePanel))
}

export const isChromeClipperMessage = (value: unknown): value is ChromeClipperMessage =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  (value.type === CHROME_MESSAGES.startPicking || value.type === CHROME_MESSAGES.togglePanel)
