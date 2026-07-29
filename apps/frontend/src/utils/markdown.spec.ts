import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders fenced code with VS Code Dark+ highlighting', () => {
    const html = renderMarkdown('```ts\nconst answer: number = 42\n```')

    expect(html).toContain('class="shiki dark-plus"')
    expect(html).toContain('style="color:#569CD6"')
    expect(html.match(/class="line"/g)).toHaveLength(1)
  })

  it('escapes unsupported code fences', () => {
    const html = renderMarkdown('```unknown\n<script>alert(1)</script>\n```')

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
