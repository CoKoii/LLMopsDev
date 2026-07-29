import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from 'shiki/langs/bash.mjs'
import css from 'shiki/langs/css.mjs'
import html from 'shiki/langs/html.mjs'
import java from 'shiki/langs/java.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import json from 'shiki/langs/json.mjs'
import jsonc from 'shiki/langs/jsonc.mjs'
import markdownLanguage from 'shiki/langs/markdown.mjs'
import python from 'shiki/langs/python.mjs'
import scss from 'shiki/langs/scss.mjs'
import shell from 'shiki/langs/shell.mjs'
import sql from 'shiki/langs/sql.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vue from 'shiki/langs/vue.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import darkPlus from 'shiki/themes/dark-plus.mjs'

const codeTheme = 'dark-plus'
const plainTextLanguages = new Set(['text', 'txt', 'plain', 'plaintext'])
const highlighter = createHighlighterCoreSync({
  themes: [darkPlus],
  langs: [
    bash,
    css,
    html,
    java,
    javascript,
    json,
    jsonc,
    markdownLanguage,
    python,
    scss,
    shell,
    sql,
    tsx,
    typescript,
    vue,
    yaml,
  ],
  engine: createJavaScriptRegexEngine(),
})
const highlightedLanguages = new Set(highlighter.getLoadedLanguages())
const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function normalizeCodeLanguage(language: string) {
  return language.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

function escapeHtml(content: string) {
  return content.replace(/[&<>"]/g, (character) => htmlEscapeMap[character] ?? character)
}

function renderCodeFallback(content: string) {
  return `<pre><code>${escapeHtml(content)}</code></pre>`
}

function normalizeFenceContent(content: string) {
  return content.replace(/\r?\n$/, '')
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(content, language) {
    const normalizedLanguage = normalizeCodeLanguage(language)
    const normalizedContent = normalizeFenceContent(content)

    if (!normalizedLanguage || plainTextLanguages.has(normalizedLanguage)) {
      return renderCodeFallback(normalizedContent)
    }

    if (!highlightedLanguages.has(normalizedLanguage)) {
      return renderCodeFallback(normalizedContent)
    }

    return highlighter.codeToHtml(normalizedContent, {
      lang: normalizedLanguage,
      theme: codeTheme,
    })
  },
})

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  if (!token) {
    return self.renderToken(tokens, index, options)
  }

  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, index, options)
}

export function renderMarkdown(content: string) {
  return DOMPurify.sanitize(markdown.render(content || ''))
}
