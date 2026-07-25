<script setup lang="ts">
import { Button, Modal, Tag } from 'antdv-next'
import { ref } from 'vue'

defineProps<{
  open: boolean
  source: string
  result: string
  display: string
  optimizing: boolean
}>()

const emit = defineEmits<{
  close: []
  regenerate: []
  apply: []
}>()

const resultRef = ref<HTMLElement>()

function scrollResultToBottom() {
  if (resultRef.value) {
    resultRef.value.scrollTop = resultRef.value.scrollHeight
  }
}

defineExpose({ scrollResultToBottom })
</script>

<template>
  <Modal
    :open="open"
    width="108rem"
    title="优化人设与回复逻辑"
    :footer="null"
    wrap-class-name="prompt-optimize-modal"
    @cancel="emit('close')"
  >
    <div class="prompt-optimize">
      <section class="prompt-optimize__panel">
        <header>
          <h3>当前版本</h3>
          <Tag>原文</Tag>
        </header>
        <pre>{{ source }}</pre>
      </section>

      <section class="prompt-optimize__panel">
        <header>
          <h3>优化版本</h3>
          <Tag v-if="optimizing" color="processing">生成中</Tag>
          <Tag v-else-if="result" color="success">可应用</Tag>
        </header>
        <pre ref="resultRef" :class="{ 'is-empty': !result && optimizing }">{{ display }}</pre>
      </section>
    </div>

    <footer class="prompt-optimize__actions">
      <Button @click="emit('close')">取消</Button>
      <div class="prompt-optimize__primary-actions">
        <Button :loading="optimizing" @click="emit('regenerate')">重新生成</Button>
        <Button type="primary" :disabled="!result || optimizing" @click="emit('apply')">
          应用
        </Button>
      </div>
    </footer>
  </Modal>
</template>

<style scoped lang="scss">
.prompt-optimize {
  --color-text: var(--font-color);
  --color-text-strong: var(--font-active-color);
  --color-text-muted: var(--font-light-color);
  --color-bg-panel: var(--white);
  --color-bg-soft: var(--touch-bg);
  --color-border-light: var(--border-color);
  --color-border-strong: #d8dee8;
  --radius-md: 0.8rem;
  --space-4: 1.6rem;
  --font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;

  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2.4rem;
  height: min(56rem, calc(100vh - 22rem));
  min-height: 36rem;
}

:global(.prompt-optimize-modal .ant-modal-body) {
  padding-top: 0.8rem;
}

.prompt-optimize__panel {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-soft);
  border: 0.1rem solid var(--color-border-strong);
  border-radius: var(--radius-md);
}

.prompt-optimize__panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 4.8rem;
  padding: 0 var(--space-4);
  background: var(--color-bg-panel);
  border-bottom: 0.1rem solid var(--color-border-light);
}

.prompt-optimize__panel h3 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
}

.prompt-optimize__panel pre {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 1.8rem 2rem;
  overflow: auto;
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: 1.4rem;
  line-height: 2.3rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--color-bg-panel);
}

.prompt-optimize__panel pre.is-empty {
  color: var(--color-text-muted);
}

.prompt-optimize__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.4rem;
  margin-top: 2.4rem;
  padding-top: 1.8rem;
  border-top: 0.1rem solid var(--color-border-light);
}

.prompt-optimize__primary-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1.2rem;
}

.prompt-optimize__actions :deep(.ant-btn) {
  min-width: 8.8rem;
}

@media (max-width: 900px) {
  .prompt-optimize {
    grid-template-columns: 1fr;
  }
}
</style>
