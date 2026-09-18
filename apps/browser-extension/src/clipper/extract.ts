import type { WebClipPayload } from '../types'

const MAX_FIELD_LENGTH = 120000

const BLOCK_TAGS = new Set([
  'ARTICLE',
  'SECTION',
  'MAIN',
  'DIV',
  'P',
  'PRE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'TABLE',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
])

const DROP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'header',
  'footer',
  'aside',
].join(',')

const limit = (value: string) => value.slice(0, MAX_FIELD_LENGTH)

const compactText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const normalizeMarkdown = (value: string) =>
  value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const absoluteUrl = (value: string | null) => {
  if (!value) return ''

  try {
    return new URL(value, window.location.href).toString()
  } catch {
    return value
  }
}

const textFromChildren = (element: Element): string =>
  Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
      if (node.nodeType === Node.ELEMENT_NODE) return nodeToMarkdown(node as Element)
      return ''
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')

const tableToMarkdown = (table: Element) => {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.querySelectorAll('th,td')).map((cell) =>
        compactText(cell.textContent || '').replace(/\|/g, '\\|'),
      ),
    )
    .filter((row) => row.some(Boolean))

  if (!rows.length) return ''

  const columnCount = Math.max(...rows.map((row) => row.length))
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ''),
  ])
  const head = normalizedRows[0] ?? []
  const body = normalizedRows.slice(1)
  const separator = Array.from({ length: columnCount }, () => '---')

  return [head, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n')
}

const nodeToMarkdown = (element: Element): string => {
  const tag = element.tagName

  if (tag === 'BR') return '\n'
  if (tag === 'IMG') {
    const alt = compactText(element.getAttribute('alt') || element.getAttribute('title') || '')
    const src = absoluteUrl(element.getAttribute('src'))
    return alt && src ? `![${alt}](${src})` : alt
  }
  if (tag === 'A') {
    const label = compactText(textFromChildren(element))
    const href = absoluteUrl(element.getAttribute('href'))
    if (!label) return ''
    return href ? `[${label}](${href})` : label
  }
  if (tag === 'STRONG' || tag === 'B') return `**${compactText(textFromChildren(element))}**`
  if (tag === 'EM' || tag === 'I') return `_${compactText(textFromChildren(element))}_`
  if (tag === 'CODE' && element.parentElement?.tagName !== 'PRE') {
    return `\`${compactText(element.textContent || '')}\``
  }
  if (tag === 'PRE') return `\n\n\`\`\`\n${(element.textContent || '').trim()}\n\`\`\`\n\n`
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    return `\n\n${'#'.repeat(level)} ${compactText(textFromChildren(element))}\n\n`
  }
  if (tag === 'LI') return `\n- ${compactText(textFromChildren(element))}`
  if (tag === 'UL' || tag === 'OL') return `\n${textFromChildren(element)}\n`
  if (tag === 'BLOCKQUOTE') return `\n\n> ${compactText(textFromChildren(element))}\n\n`
  if (tag === 'TABLE') return `\n\n${tableToMarkdown(element)}\n\n`

  const text = textFromChildren(element)
  if (!BLOCK_TAGS.has(tag)) return text

  const normalized = tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN'
    ? normalizeMarkdown(text)
    : compactText(text)

  return normalized ? `\n\n${normalized}\n\n` : ''
}

const elementToMarkdown = (element: Element, title: string, url: string) =>
  [
    title ? `# ${title}` : '',
    url ? `> 来源：${url}` : '',
    normalizeMarkdown(nodeToMarkdown(element)),
  ]
    .filter(Boolean)
    .join('\n\n')

const createCleanClone = (element: Element) => {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll(DROP_SELECTOR).forEach((node) => node.remove())
  clone.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      if (!['href', 'src', 'alt', 'title'].includes(attribute.name)) {
        node.removeAttribute(attribute.name)
      }
    })
  })
  return clone
}

const createSelector = (element: Element) => {
  const parts: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`${tag}#${CSS.escape(current.id)}`)
      break
    }

    const parent: Element | null = current.parentElement
    const currentTag = current.tagName
    const sameTagSiblings = parent
      ? Array.from(parent.children).filter((child): child is Element => child.tagName === currentTag)
      : []
    const sameTagIndex = parent ? sameTagSiblings.indexOf(current) + 1 : 1
    parts.unshift(`${tag}:nth-of-type(${sameTagIndex})`)
    current = parent
  }

  return parts.join(' > ')
}

const resolveTitle = (element: Element) =>
  compactText(element.querySelector('h1')?.textContent || document.querySelector('h1')?.textContent || document.title)

const getElementText = (element: Element) =>
  compactText((element as HTMLElement).innerText || element.textContent || '')

export const buildClipPayload = (element: Element): WebClipPayload => {
  const clone = createCleanClone(element)
  const title = resolveTitle(clone)
  const url = window.location.href
  const text = limit(getElementText(clone))
  const html = limit(clone.outerHTML)
  const markdown = limit(elementToMarkdown(clone, title, url))

  return {
    id: `${Date.now()}`,
    title,
    url,
    selector: createSelector(element),
    text,
    html,
    markdown,
    capturedAt: new Date().toISOString(),
    characterCount: text.length,
  }
}
