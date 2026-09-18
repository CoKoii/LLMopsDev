<script setup lang="ts">
import { Bot, ChevronDown, RefreshCw } from '@lucide/vue'
import { Button, Popover, TextArea } from 'antdv-next'
import { computed } from 'vue'
import ModelSettingsPopover from './ModelSettingsPopover.vue'

type ModelSettings = {
  temperature: number
  topP: number
  presencePenalty: number
  frequencyPenalty: number
  contextRounds: number
}

const props = defineProps<{
  modelSettingsOpen: boolean
  selectedModelLabel: string
  selectedLlmId: number | null
  modelOptions: Array<{ label: string; value: number }>
  loading: boolean
  settings: ModelSettings
  promptContent: string
  optimizingPrompt: boolean
}>()

const emit = defineEmits<{
  'update:modelSettingsOpen': [value: boolean]
  'update:selectedLlmId': [value: number | null]
  'update:settings': [value: ModelSettings]
  'update:promptContent': [value: string]
  optimize: []
}>()

const modelSettingsVisible = computed({
  get: () => props.modelSettingsOpen,
  set: (value: boolean) => emit('update:modelSettingsOpen', value),
})
const selectedModel = computed({
  get: () => props.selectedLlmId,
  set: (value: number | null) => emit('update:selectedLlmId', value),
})
const promptModel = computed({
  get: () => props.promptContent,
  set: (value: string) => emit('update:promptContent', value),
})
</script>

<template>
  <section class="app-orchestration__prompt orchestration-workspace-panel">
    <div class="orchestration-panel__header">
      <div class="app-orchestration__title-row">
        <h2>应用编排</h2>
        <Popover v-model:open="modelSettingsVisible" trigger="click" placement="bottomLeft">
          <button class="app-orchestration__model-trigger" type="button">
            <Bot :size="14" />
            <span>{{ selectedModelLabel }}</span>
            <ChevronDown :size="14" />
          </button>
          <template #content>
            <ModelSettingsPopover
              v-model:selected-llm-id="selectedModel"
              :model-options="modelOptions"
              :loading="loading"
              :settings="settings"
              @update:settings="emit('update:settings', $event)"
            />
          </template>
        </Popover>
      </div>
    </div>
    <div class="app-orchestration__prompt-content">
      <div class="app-orchestration__prompt-heading">
        <h3>人设与回复逻辑</h3>
        <Button type="text" size="small" :loading="optimizingPrompt" @click="emit('optimize')">
          <template #icon><RefreshCw :size="15" /></template>
          优化
        </Button>
      </div>
      <TextArea
        v-model:value="promptModel"
        class="app-orchestration__prompt-editor"
        placeholder="描述 AI 应用的角色定位、任务范围和回复规则"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.app-orchestration__prompt,
.app-orchestration__prompt *,
.app-orchestration__prompt *::before,
.app-orchestration__prompt *::after {
  box-sizing: border-box;
}

.orchestration-workspace-panel {
  min-width: 0;
  min-height: 0;
  background: var(--color-bg-panel);
}

.orchestration-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 6.4rem;
  padding: 0 2.4rem;
  border-bottom: 0.1rem solid var(--color-border-light);
}

.app-orchestration__prompt {
  display: flex;
  flex-direction: column;
}

.app-orchestration__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.app-orchestration__title-row h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.app-orchestration__model-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 2.8rem;
  padding: 0 var(--space-2);
  color: var(--color-text);
  font: inherit;
  font-size: 1.3rem;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.app-orchestration__model-trigger:hover,
.app-orchestration__model-trigger:focus-visible,
.app-orchestration__model-trigger[aria-expanded='true'] {
  color: var(--color-primary);
  background: var(--color-bg-soft);
  outline: 0;
}

.app-orchestration__prompt-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: var(--space-4) 2.4rem 3.2rem;
  overflow: hidden;
}

.app-orchestration__prompt-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.app-orchestration__prompt-heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.4rem;
  font-weight: 600;
}

.app-orchestration__prompt-editor {
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 0;
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 2.3rem;
  resize: none;
  white-space: pre-wrap;
}

.app-orchestration__prompt-editor,
.app-orchestration__prompt-editor:hover,
.app-orchestration__prompt-editor:focus {
  border-color: transparent;
  box-shadow: none;
}

@media (max-width: 1180px) {
  .app-orchestration__prompt-content {
    min-height: 57.6rem;
  }
}

@media (max-width: 700px) {
  .orchestration-panel__header,
  .app-orchestration__prompt-content {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }
}
</style>
