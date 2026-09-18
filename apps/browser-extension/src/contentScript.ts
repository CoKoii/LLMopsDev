import { createApp } from 'vue'
import PageClipper from './PageClipper.vue'
import { buildClipPayload } from './clipper/extract'
import {
  CHROME_MESSAGES,
  CLIPPER_EVENTS,
  dispatchClipCaptured,
  dispatchTogglePanel,
  isChromeClipperMessage,
} from './clipper/messages'
import pageClipperStyles from './pageClipper.css?inline'

const ROOT_ID = 'llmops-clipper-root'
const OVERLAY_ID = 'llmops-clipper-overlay'
const HINT_ID = 'llmops-clipper-hint'

let picking = false
let hoveredElement: HTMLElement | undefined
let overlay: HTMLDivElement | undefined
let hint: HTMLDivElement | undefined
let mounted = false
let previousCursor = ''

const mountClipperUi = () => {
  if (mounted || document.getElementById(ROOT_ID)) return

  const host = document.createElement('div')
  host.id = ROOT_ID
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  const appContainer = document.createElement('div')

  style.textContent = pageClipperStyles
  shadow.append(style, appContainer)
  document.documentElement.append(host)
  createApp(PageClipper).mount(appContainer)
  mounted = true
}

const ensureOverlay = () => {
  if (overlay && hint) return

  overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.style.cssText = [
    'position:fixed',
    'z-index:2147483646',
    'pointer-events:none',
    'border:2px solid #1d4ed8',
    'background:rgba(29,78,216,.10)',
    'box-shadow:0 0 0 99999px rgba(17,24,39,.10)',
    'border-radius:4px',
    'transition:all .06s ease',
  ].join(';')

  hint = document.createElement('div')
  hint.id = HINT_ID
  hint.textContent = '点击选择正文区域，按 Esc 取消'
  hint.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:18px',
    'z-index:2147483647',
    'transform:translateX(-50%)',
    'padding:8px 12px',
    'border-radius:999px',
    'background:#111827',
    'color:#fff',
    'font:13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 12px 30px rgba(15,23,42,.22)',
  ].join(';')

  document.documentElement.append(overlay, hint)
}

const removeOverlay = () => {
  overlay?.remove()
  hint?.remove()
  overlay = undefined
  hint = undefined
}

const moveOverlay = (element: HTMLElement) => {
  ensureOverlay()
  const rect = element.getBoundingClientRect()
  if (!overlay) return

  overlay.style.left = `${Math.max(rect.left, 0)}px`
  overlay.style.top = `${Math.max(rect.top, 0)}px`
  overlay.style.width = `${Math.max(rect.width, 0)}px`
  overlay.style.height = `${Math.max(rect.height, 0)}px`
}

const resolvePickerTarget = (event: MouseEvent) => {
  const host = document.getElementById(ROOT_ID)
  const path = event.composedPath()
  if (host && path.includes(host)) return undefined

  return path.find(
    (node): node is HTMLElement =>
      node instanceof HTMLElement &&
      node.id !== OVERLAY_ID &&
      node.id !== HINT_ID &&
      node !== document.documentElement,
  )
}

const stopPicking = () => {
  picking = false
  hoveredElement = undefined
  document.documentElement.style.cursor = previousCursor
  removeOverlay()
  document.removeEventListener('mousemove', handleMouseMove, true)
  document.removeEventListener('click', handleClick, true)
  document.removeEventListener('keydown', handleKeydown, true)
}

function handleMouseMove(event: MouseEvent) {
  if (!picking) return

  const target = resolvePickerTarget(event)
  if (!target) return

  hoveredElement = target
  moveOverlay(target)
}

function handleClick(event: MouseEvent) {
  if (!picking || !hoveredElement) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const clip = buildClipPayload(hoveredElement)
  stopPicking()
  dispatchClipCaptured(clip)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    stopPicking()
  }
}

const startPicking = () => {
  mountClipperUi()
  stopPicking()
  previousCursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = 'crosshair'
  picking = true
  ensureOverlay()
  document.addEventListener('mousemove', handleMouseMove, true)
  document.addEventListener('click', handleClick, true)
  document.addEventListener('keydown', handleKeydown, true)
}

window.addEventListener(CLIPPER_EVENTS.startPicking, startPicking)
mountClipperUi()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isChromeClipperMessage(message)) return

  if (message.type === CHROME_MESSAGES.startPicking) {
    startPicking()
  }

  if (message.type === CHROME_MESSAGES.togglePanel) {
    mountClipperUi()
    dispatchTogglePanel()
  }

  sendResponse({ ok: true })
})
