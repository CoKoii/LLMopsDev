<script setup lang="ts">
import { Check, FileText, Plus, Trash2 } from '@lucide/vue'
import { Button, Checkbox, Input, message } from 'antdv-next'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createUploadedDocuments, readUploadedDocuments, writeUploadedDocuments } from '../documents'

interface UploadFileItem {
  id: number
  file: File
  name: string
  size: number
  progress: number
  status: 'waiting' | 'processing' | 'done'
}

type WizardStep = 1 | 2 | 3
type ChunkMode = 'auto' | 'custom'

const route = useRoute()
const router = useRouter()
const wizardStep = ref<WizardStep>(1)
const selectedFiles = ref<UploadFileItem[]>([])
const chunkMode = ref<ChunkMode>('auto')
const processing = ref(false)
const processingTimer = ref<number>()
const fileInputRef = ref<HTMLInputElement>()
const customConfig = reactive({
  separator: '',
  maxSegmentLength: '',
  replaceWhitespace: false,
  removeUrls: false,
})

const acceptedExtensions = ['pdf', 'txt', 'doc', 'docx', 'md']
const maxFileCount = 10
const maxFileSize = 10 * 1024 * 1024

const uploadStepItems = computed(() => [
  { index: 1 as WizardStep, title: '上传', done: wizardStep.value > 1 },
  { index: 2 as WizardStep, title: '分段设置', done: wizardStep.value > 2 },
  { index: 3 as WizardStep, title: '数据处理', done: false },
])

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
      progress: 0,
      status: 'waiting' as const,
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

const startProcessing = () => {
  processing.value = true
  selectedFiles.value = selectedFiles.value.map((item) => ({
    ...item,
    status: 'processing',
    progress: item.progress || 12,
  }))

  processingTimer.value = window.setInterval(() => {
    selectedFiles.value = selectedFiles.value.map((item) => {
      if (item.status === 'done') return item

      const nextProgress = Math.min(item.progress + 13 + Math.round(Math.random() * 16), 100)
      return {
        ...item,
        progress: nextProgress,
        status: nextProgress >= 100 ? 'done' : 'processing',
      }
    })

    if (selectedFiles.value.every((item) => item.status === 'done')) {
      window.clearInterval(processingTimer.value)
      processing.value = false
    }
  }, 500)
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
    startProcessing()
  }
}

const goPreviousStep = () => {
  if (wizardStep.value === 2) {
    wizardStep.value = 1
  }
}

const confirmUpload = () => {
  window.clearInterval(processingTimer.value)
  processing.value = false

  const knowledgeId = parseKnowledgeId()
  const existingDocuments = readUploadedDocuments(knowledgeId)
  const newDocuments = createUploadedDocuments(selectedFiles.value, existingDocuments)

  writeUploadedDocuments(knowledgeId, [...newDocuments, ...existingDocuments])
  message.success('文件已添加')
  void router.push({ name: 'knowledge-files', params: { knowledgeId } })
}

onBeforeUnmount(() => {
  window.clearInterval(processingTimer.value)
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
          <button class="drop-zone" type="button" @click="chooseFiles" @dragover.prevent @drop.prevent="handleDrop">
            <Plus class="drop-zone__icon" />
            <span>点击或拖拽文件到此处上传</span>
            <small>支持PDF、TXT、DOC、DOCX、MD，最多可上传10个文件，每个文件不超过10MB</small>
          </button>
          <input
            ref="fileInputRef"
            class="hidden-file-input"
            type="file"
            multiple
            accept=".pdf,.txt,.doc,.docx,.md"
            @change="handleFileInputChange"
          />

          <TransitionGroup v-if="selectedFiles.length" name="file-list" tag="div" class="selected-file-list">
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
                <Input v-model:value="customConfig.maxSegmentLength" placeholder="请输入100 - 10000的数值" />
              </label>
              <div class="preprocess-rules">
                <span>文本预处理规则</span>
                <Checkbox v-model:checked="customConfig.replaceWhitespace">
                  替换连续的空格、换行符和制表符
                </Checkbox>
                <Checkbox v-model:checked="customConfig.removeUrls">删除所有 URL 和电子邮件地址</Checkbox>
              </div>
            </div>
          </div>
        </section>

        <section v-else key="processing" class="processing-panel">
          <p class="processing-title">服务器处理中</p>
          <div class="processing-list">
            <div v-for="item in selectedFiles" :key="item.id" class="processing-file">
              <div class="processing-file__icon">
                <FileText />
              </div>
              <div class="processing-file__meta">
                <strong>{{ item.name }}</strong>
                <span>{{ formatFileSize(item.size) }}</span>
              </div>
              <span class="processing-file__status">
                {{ item.status === 'done' ? '处理完成' : `${item.progress}%` }}
              </span>
            </div>
          </div>
        </section>
      </Transition>
    </main>

    <footer class="upload-footer">
      <p v-if="wizardStep === 3">点击确认不影响数据处理，处理完毕后可进行引用</p>
      <div class="upload-actions">
        <Button v-if="wizardStep === 2" @click="goPreviousStep">上一步</Button>
        <Button v-if="wizardStep < 3" type="primary" @click="goNextStep">下一步</Button>
        <Button v-else type="primary" @click="confirmUpload">确定</Button>
      </div>
    </footer>
  </div>
</template>

<style src="./index.scss" scoped lang="scss"></style>
