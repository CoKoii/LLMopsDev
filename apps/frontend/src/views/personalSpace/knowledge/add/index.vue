<script setup lang="ts">
import {
  createKnowledgeDocumentApi,
  getKnowledgeDocumentApi,
  uploadFileApi,
  type KnowledgeDocumentChunkConfig,
  type KnowledgeDocumentItem,
} from '@/api'
import { Check, FileText, Plus, Trash2 } from '@lucide/vue'
import { Button, Checkbox, Input, message } from 'antdv-next'
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface UploadFileItem {
  id: number
  file: File
  name: string
  size: number
  status: 'waiting' | 'uploading' | 'creating' | 'processing' | 'completed' | 'failed'
  message: string
}

type WizardStep = 1 | 2 | 3
type ChunkMode = 'auto' | 'custom'

const route = useRoute()
const router = useRouter()
const wizardStep = ref<WizardStep>(1)
const selectedFiles = ref<UploadFileItem[]>([])
const chunkMode = ref<ChunkMode>('auto')
const processingStarted = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const customConfig = reactive({
  separator: '',
  maxSegmentLength: '',
  replaceWhitespace: false,
  removeUrls: false,
})

const acceptedExtensions = ['pdf', 'txt', 'docx', 'md', 'json', 'csv', 'html', 'htm', 'xlsx', 'xls']
const maxFileCount = 10
const maxFileSize = 10 * 1024 * 1024
let disposed = false

const uploadStepItems = computed(() => [
  { index: 1 as WizardStep, title: '上传', done: wizardStep.value > 1 },
  { index: 2 as WizardStep, title: '分段设置', done: wizardStep.value > 2 },
  { index: 3 as WizardStep, title: '数据处理', done: false },
])

const allFilesHandled = computed(
  () =>
    selectedFiles.value.length > 0 &&
    selectedFiles.value.every((item) => item.status === 'completed' || item.status === 'failed'),
)

const parseKnowledgeId = () => {
  const value = route.params.knowledgeId
  return Number(Array.isArray(value) ? value[0] : value)
}

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) {
    return `${Number((value / 1024 / 1024).toFixed(2))} MB`
  }
  return `${Number((value / 1024).toFixed(2))} KB`
}

const chooseFiles = () => {
  fileInputRef.value?.click()
}

const isAcceptedFile = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension ? acceptedExtensions.includes(extension) : false
}

const appendFiles = (fileList: FileList | File[]) => {
  const nextFiles = Array.from(fileList)
  const availableCount = maxFileCount - selectedFiles.value.length
  const validFiles = nextFiles.filter((file) => {
    if (!isAcceptedFile(file)) {
      message.error(`${file.name} 文件格式不支持`)
      return false
    }
    if (file.size > maxFileSize) {
      message.error(`${file.name} 超过10MB`)
      return false
    }
    if (selectedFiles.value.some((item) => item.name === file.name && item.size === file.size)) {
      message.warning(`${file.name} 已在列表中`)
      return false
    }
    return true
  })

  if (validFiles.length > availableCount) {
    message.warning(`最多只能上传${maxFileCount}个文件`)
  }

  selectedFiles.value = [
    ...selectedFiles.value,
    ...validFiles.slice(0, Math.max(availableCount, 0)).map((file) => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      status: 'waiting' as const,
      message: '待处理',
    })),
  ]
}

const handleFileInputChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files) {
    appendFiles(input.files)
  }
  input.value = ''
}

const handleDrop = (event: DragEvent) => {
  if (event.dataTransfer?.files) {
    appendFiles(event.dataTransfer.files)
  }
}

const removeSelectedFile = (fileId: number) => {
  selectedFiles.value = selectedFiles.value.filter((item) => item.id !== fileId)
}

const goNextStep = () => {
  if (wizardStep.value === 1 && selectedFiles.value.length === 0) {
    message.warning('请先上传文件')
    return
  }

  if (wizardStep.value === 2 && chunkMode.value === 'custom') {
    const maxSegmentLength = Number(customConfig.maxSegmentLength)
    if (!customConfig.separator.trim()) {
      message.warning('请输入分段标识符')
      return
    }
    if (!Number.isInteger(maxSegmentLength) || maxSegmentLength < 100 || maxSegmentLength > 10000) {
      message.warning('请输入100 - 10000的分段最大长度')
      return
    }
  }

  if (wizardStep.value === 1) {
    wizardStep.value = 2
    return
  }

  if (wizardStep.value === 2) {
    wizardStep.value = 3
    void startProcessing()
  }
}

const goPreviousStep = () => {
  if (wizardStep.value === 2) {
    wizardStep.value = 1
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

const hasDocumentFailed = (document: KnowledgeDocumentItem) =>
  document.parseStatus === 'failed' ||
  document.cleanStatus === 'failed' ||
  document.enhanceStatus === 'failed' ||
  document.chunkStatus === 'failed' ||
  document.embeddingStatus === 'failed' ||
  document.indexStatus === 'failed'

const resolveDocumentFailure = (document: KnowledgeDocumentItem) => {
  if (document.parseStatus === 'failed') return '解析失败'
  if (document.cleanStatus === 'failed') return '清洗失败'
  if (document.enhanceStatus === 'failed') return '增强失败'
  if (document.chunkStatus === 'failed') return '切片失败'
  if (document.embeddingStatus === 'failed') return '向量化失败'
  if (document.indexStatus === 'failed') return '入库失败'
  return '处理失败'
}

const resolveDocumentProgress = (document: KnowledgeDocumentItem) => {
  if (document.indexStatus === 'indexed') return '处理完成'
  if (document.indexStatus === 'indexing') return '写入索引'
  if (document.embeddingStatus === 'embedding') return '向量化中'
  if (document.embeddingStatus === 'embedded') return '写入索引'
  if (document.embeddingStatus === 'queued') return '等待向量化'
  if (document.chunkStatus === 'chunking') return '切片中'
  if (document.chunkStatus === 'chunked') return '等待向量化'
  if (document.enhanceStatus === 'enhancing') return '增强中'
  if (document.enhanceStatus === 'enhanced') return '切片中'
  if (document.cleanStatus === 'cleaning') return '清洗中'
  if (document.cleanStatus === 'cleaned') return '切片中'
  if (document.parseStatus === 'parsing') return '解析中'
  if (document.parseStatus === 'parsed') return '清洗中'
  return '等待处理'
}

const buildChunkConfig = (): KnowledgeDocumentChunkConfig | undefined => {
  if (chunkMode.value !== 'custom') return undefined

  return {
    separator: customConfig.separator.trim(),
    maxSegmentLength: Number(customConfig.maxSegmentLength),
    replaceWhitespace: customConfig.replaceWhitespace,
    removeUrls: customConfig.removeUrls,
  }
}

const pollDocumentProgress = async (
  knowledgeId: number,
  documentId: number,
  item: UploadFileItem,
) => {
  while (!disposed) {
    const document = await getKnowledgeDocumentApi(knowledgeId, documentId, {
      suppressErrorNotify: true,
    })
    if (disposed) return

    item.message = resolveDocumentProgress(document)

    if (hasDocumentFailed(document)) {
      item.status = 'failed'
      item.message = resolveDocumentFailure(document)
      return
    }

    if (document.indexStatus === 'indexed') {
      item.status = 'completed'
      item.message = '处理完成'
      return
    }

    await wait(1200)
  }
}

const processSelectedFile = async (
  knowledgeId: number,
  item: UploadFileItem,
  chunkConfig?: KnowledgeDocumentChunkConfig,
) => {
  try {
    if (disposed) return
    item.status = 'uploading'
    item.message = '上传中'

    const uploadedFile = await uploadFileApi(item.file, {
      suppressErrorNotify: true,
    })
    if (disposed) return

    item.status = 'creating'
    item.message = '创建文档'

    const document = await createKnowledgeDocumentApi(
      knowledgeId,
      {
        fileId: uploadedFile.id,
        chunkConfig,
      },
      { suppressErrorNotify: true },
    )
    if (disposed) return

    item.status = 'processing'
    item.message = resolveDocumentProgress(document)

    await pollDocumentProgress(knowledgeId, document.id, item)
  } catch {
    if (disposed) return

    item.status = 'failed'
    item.message = '处理失败'
  }
}

const startProcessing = async () => {
  const knowledgeId = parseKnowledgeId()
  if (!Number.isFinite(knowledgeId)) return
  if (processingStarted.value) return

  processingStarted.value = true
  const chunkConfig = buildChunkConfig()
  await Promise.all(
    selectedFiles.value.map((item) => processSelectedFile(knowledgeId, item, chunkConfig)),
  )
  if (disposed) return

  if (selectedFiles.value.every((item) => item.status === 'completed')) {
    message.success('文件处理完成')
  } else {
    message.warning('部分文件处理失败')
  }
}

const finishUpload = () => {
  void router.push({ name: 'knowledge-files', params: { knowledgeId: parseKnowledgeId() } })
}

onUnmounted(() => {
  disposed = true
})
</script>

<template>
  <div class="knowledge-upload-page">
    <header class="upload-header">
      <h1>添加文件</h1>
    </header>

    <nav class="upload-steps" aria-label="添加文件步骤">
      <template v-for="(step, index) in uploadStepItems" :key="step.index">
        <div class="upload-step" :class="{ active: wizardStep === step.index, done: step.done }">
          <span class="upload-step__badge">
            <Check v-if="step.done" />
            <span v-else>{{ step.index }}</span>
          </span>
          <span>{{ step.title }}</span>
        </div>
        <span v-if="index < uploadStepItems.length - 1" class="upload-step__line" />
      </template>
    </nav>

    <main class="upload-main">
      <Transition name="step-switch" mode="out-in">
        <section v-if="wizardStep === 1" key="upload-files" class="upload-panel">
          <button
            class="drop-zone"
            type="button"
            @click="chooseFiles"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <Plus class="drop-zone__icon" />
            <span>点击或拖拽文件到此处上传</span>
            <small
              >支持PDF、TXT、DOCX、MD、JSON、CSV、HTML、XLSX，最多10个文件，每个不超过10MB</small
            >
          </button>
          <input
            ref="fileInputRef"
            class="hidden-file-input"
            type="file"
            multiple
            accept=".pdf,.txt,.docx,.md,.json,.csv,.html,.htm,.xlsx,.xls"
            @change="handleFileInputChange"
          />

          <TransitionGroup
            v-if="selectedFiles.length"
            name="file-list"
            tag="div"
            class="selected-file-list"
          >
            <div v-for="item in selectedFiles" :key="item.id" class="selected-file">
              <FileText class="selected-file__icon" />
              <span>{{ item.name }}</span>
              <button
                class="selected-file__delete"
                type="button"
                title="删除"
                aria-label="删除文件"
                @click="removeSelectedFile(item.id)"
              >
                <Trash2 />
              </button>
            </div>
          </TransitionGroup>
        </section>

        <section v-else-if="wizardStep === 2" key="chunk-setting" class="chunk-panel">
          <button
            class="chunk-option"
            type="button"
            :class="{ active: chunkMode === 'auto' }"
            @click="chunkMode = 'auto'"
          >
            <strong>自动分段与清洗</strong>
            <span>自动分段与预处理规则</span>
          </button>

          <div class="chunk-option" :class="{ active: chunkMode === 'custom' }">
            <button class="chunk-option__head" type="button" @click="chunkMode = 'custom'">
              <strong>自定义</strong>
              <span>自定义分段规则、分段长度与预处理规则</span>
            </button>

            <div v-if="chunkMode === 'custom'" class="custom-chunk-form">
              <label>
                <span>分段标识符 <b>*</b></span>
                <Input
                  v-model:value="customConfig.separator"
                  placeholder="请输入分段标识符，如果有多个标识符，请使用英文逗号进行分割"
                />
              </label>
              <label>
                <span>分段最大长度 <b>*</b></span>
                <Input
                  v-model:value="customConfig.maxSegmentLength"
                  placeholder="请输入100 - 10000的数值"
                />
              </label>
              <div class="preprocess-rules">
                <span>文本预处理规则</span>
                <Checkbox v-model:checked="customConfig.replaceWhitespace">
                  替换连续的空格、换行符和制表符
                </Checkbox>
                <Checkbox v-model:checked="customConfig.removeUrls"
                  >删除所有 URL 和电子邮件地址</Checkbox
                >
              </div>
            </div>
          </div>
        </section>

        <section v-else key="processing" class="processing-panel">
          <p class="processing-title">数据处理中</p>
          <div class="processing-list">
            <div
              v-for="item in selectedFiles"
              :key="item.id"
              class="processing-file"
              :class="{ failed: item.status === 'failed', completed: item.status === 'completed' }"
            >
              <div class="processing-file__icon">
                <FileText />
              </div>
              <div class="processing-file__meta">
                <strong>{{ item.name }}</strong>
                <span>{{ formatFileSize(item.size) }}</span>
              </div>
              <span class="processing-file__status">{{ item.message }}</span>
            </div>
          </div>
        </section>
      </Transition>
    </main>

    <footer class="upload-footer">
      <p v-if="wizardStep === 3">进入本步骤后会自动处理，可留在当前页查看进度</p>
      <div class="upload-actions">
        <Button v-if="wizardStep === 2" @click="goPreviousStep">上一步</Button>
        <Button v-if="wizardStep < 3" type="primary" @click="goNextStep">下一步</Button>
        <Button v-else type="primary" @click="finishUpload">
          {{ allFilesHandled ? '完成' : '返回列表' }}
        </Button>
      </div>
    </footer>
  </div>
</template>

<style src="./index.scss" scoped lang="scss"></style>
