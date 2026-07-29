<script setup lang="ts">
import { computed } from 'vue'
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  LoaderCircle,
  LogIn,
  MousePointer2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from '@lucide/vue'
import { useClipperSession } from './clipper/useClipperSession'

const {
  accountLabel,
  canClean,
  canUpload,
  cleanClip,
  cleanedMarkdown,
  cleaning,
  clip,
  clipTitle,
  closeModal,
  hasCleanedMarkdown,
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
} = useClipperSession()

const stepItems = computed(() => {
  const hasClip = Boolean(clip.value)
  const hasClean = Boolean(cleanedMarkdown.value.trim())

  return [
    {
      key: 'capture',
      title: '采集',
      done: hasClip,
      active: !hasClip,
    },
    {
      key: 'clean',
      title: '清洗可选',
      done: hasClean,
      active: stage.value === 'cleaning',
    },
    {
      key: 'upload',
      title: '上传',
      done: stage.value === 'completed',
      active: hasClip && stage.value !== 'cleaning',
    },
  ]
})

const cleanButtonText = computed(() => {
  if (cleaning.value) return '清洗中'
  return hasCleanedMarkdown.value ? '重新清洗' : '清洗优化'
})

const uploadButtonText = computed(() => {
  if (uploading.value || processing.value) return uploadItem.value?.message || '处理中'
  if (uploadItem.value?.status === 'failed') return '重新上传'
  if (uploadItem.value?.status === 'completed') return '已上传'
  return '上传'
})

const footerHint = computed(() => {
  if (!clip.value) return '先选择网页正文区域'
  if (!hasCleanedMarkdown.value) return '可直接上传，清洗只是可选优化'
  return selectedKnowledge.value ? `将上传到：${selectedKnowledge.value.name}` : '请选择知识库'
})

const formatDate = (value?: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) return `${Number((value / 1024 / 1024).toFixed(2))} MB`
  return `${Number((value / 1024).toFixed(2))} KB`
}
</script>

<template>
  <div class="llmops-clipper">
    <div class="dock">
      <div class="dock-hit" />
      <div class="devtools-bar">
        <button class="dock-button" type="button" aria-label="打开网页剪藏" @click="openModal">
          <span class="dock-dot">L</span>
          <span>网页剪藏</span>
        </button>
      </div>
    </div>

    <div v-if="modalOpen" class="modal-layer" @mousedown.self="closeModal">
      <section
        class="modal-shell"
        :class="{ 'is-login': modalView === 'login' }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llmopsClipperTitle"
      >
        <header class="modal-header">
          <div class="modal-title">
            <span class="modal-mark">L</span>
            <div>
              <h1 id="llmopsClipperTitle">网页剪藏</h1>
              <p>{{ accountLabel }}</p>
            </div>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" @click="closeModal">
            <X />
          </button>
        </header>

        <template v-if="modalView === 'login'">
          <main class="modal-body login-body">
            <form class="login-panel" @submit.prevent="submitLogin">
              <div class="login-copy">
                <h2>登录 LLMops</h2>
                <p>使用 Web 端账号登录，登录状态会自动刷新。</p>
              </div>
              <label class="field">
                <span>账号</span>
                <input v-model="loginForm.username" autocomplete="username" />
              </label>
              <label class="field">
                <span>密码</span>
                <input
                  v-model="loginForm.password"
                  type="password"
                  autocomplete="current-password"
                />
              </label>
              <button class="primary-button full-button" type="submit" :disabled="loggingIn">
                <LoaderCircle v-if="loggingIn" class="spinning" />
                <LogIn v-else />
                <span>{{ loggingIn ? '登录中' : '登录' }}</span>
              </button>
            </form>
          </main>
        </template>

        <template v-else>
          <nav class="workflow-steps" aria-label="网页剪藏流程">
            <template v-for="(step, index) in stepItems" :key="step.key">
              <div class="workflow-step" :class="{ active: step.active, done: step.done }">
                <span class="workflow-step__badge">
                  <Check v-if="step.done" />
                  <span v-else>{{ index + 1 }}</span>
                </span>
                <span>{{ step.title }}</span>
              </div>
              <span v-if="index < stepItems.length - 1" class="workflow-step__line" />
            </template>
          </nav>

          <main class="modal-body">
            <section v-if="!clip" class="empty-state">
              <span class="empty-icon"><MousePointer2 /></span>
              <h2>选择网页正文区域</h2>
              <p>鼠标移到页面内容上，点击高亮区域后会生成原始 Markdown。</p>
              <button class="primary-button" type="button" @click="startPicking">
                <MousePointer2 />
                <span>选择区域</span>
              </button>
            </section>

            <section v-else class="workbench">
              <div class="clip-summary">
                <div class="clip-summary__main">
                  <h2>{{ clipTitle }}</h2>
                  <a v-if="clip.url" :href="clip.url" target="_blank" rel="noreferrer">
                    <span>{{ clip.url }}</span>
                    <ExternalLink />
                  </a>
                </div>
                <div class="clip-summary__actions">
                  <button class="quiet-button" type="button" @click="startPicking">
                    <MousePointer2 />
                    <span>重新选择</span>
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title="清除剪藏"
                    aria-label="清除剪藏"
                    @click="removeClip"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>

              <div class="clip-meta">
                <span>{{ clip.characterCount.toLocaleString('en-US') }} 字符</span>
                <span>{{ formatDate(clip.capturedAt) }}</span>
              </div>

              <div class="compare-grid">
                <article class="markdown-pane">
                  <header>
                    <strong>原始内容</strong>
                    <span>采集自页面结构</span>
                  </header>
                  <pre class="markdown-preview">{{ sourceMarkdown }}</pre>
                </article>

                <article class="markdown-pane">
                  <header>
                    <strong>清洗结果</strong>
                    <span>{{ hasCleanedMarkdown ? '可编辑 Markdown' : '可选' }}</span>
                  </header>

                  <div v-if="cleaning" class="pane-state">
                    <LoaderCircle class="spinning" />
                    <strong>正在清洗内容</strong>
                    <span>系统会提取正文、标题和段落，过滤导航、广告等干扰内容。</span>
                  </div>

                  <textarea
                    v-else-if="hasCleanedMarkdown"
                    v-model="cleanedMarkdown"
                    class="markdown-editor"
                    spellcheck="false"
                    wrap="soft"
                  />

                  <div v-else class="pane-state muted">
                    <Sparkles />
                    <strong>可选清洗优化</strong>
                    <span>可以直接上传原始内容，也可以先清洗生成右侧 Markdown。</span>
                  </div>
                </article>
              </div>

              <div v-if="uploadItem" class="processing-file" :class="uploadItem.status">
                <div class="processing-file__icon">
                  <FileText />
                </div>
                <div class="processing-file__meta">
                  <strong>{{ uploadItem.name }}</strong>
                  <span>{{ formatFileSize(uploadItem.size) }}</span>
                </div>
                <span class="processing-file__status">{{ uploadItem.message }}</span>
              </div>
            </section>
          </main>
        </template>

        <footer
          v-if="modalView === 'clip' && (clip || status.text)"
          class="workbench-footer"
        >
          <p v-if="status.text" class="status-pill" :class="status.tone">{{ status.text }}</p>
          <p v-else class="footer-hint">{{ footerHint }}</p>

          <div v-if="clip" class="footer-controls">
            <label class="knowledge-control">
              <span>知识库</span>
              <div class="select-wrap">
                <select
                  v-model.number="settings.knowledgeId"
                  :disabled="loadingKnowledges || uploading || processing"
                  @change="saveKnowledge"
                >
                  <option :value="undefined">请选择</option>
                  <option v-for="item in knowledges" :key="item.id" :value="item.id">
                    {{ item.name }}
                  </option>
                </select>
                <ChevronDown />
              </div>
            </label>

            <button
              class="icon-button"
              type="button"
              title="刷新知识库"
              aria-label="刷新知识库"
              :disabled="loadingKnowledges || uploading || processing"
              @click="loadKnowledges"
            >
              <RefreshCw :class="{ spinning: loadingKnowledges }" />
            </button>

            <button class="quiet-button" type="button" :disabled="!canClean" @click="cleanClip">
              <LoaderCircle v-if="cleaning" class="spinning" />
              <Sparkles v-else />
              <span>{{ cleanButtonText }}</span>
            </button>

            <button class="primary-button" type="button" :disabled="!canUpload" @click="uploadClip">
              <LoaderCircle v-if="uploading || processing" class="spinning" />
              <Check v-else />
              <span>{{ uploadButtonText }}</span>
            </button>
          </div>
        </footer>

        <footer v-else-if="modalView === 'login' && status.text" class="login-status" :class="status.tone">
          {{ status.text }}
        </footer>
      </section>
    </div>
  </div>
</template>
