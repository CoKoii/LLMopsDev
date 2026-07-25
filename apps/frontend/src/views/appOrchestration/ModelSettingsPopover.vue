<script setup lang="ts">
import { InputNumber, Select, Slider } from 'antdv-next'
import { computed, reactive, watch } from 'vue'

type ModelSettings = {
  temperature: number
  topP: number
  presencePenalty: number
  frequencyPenalty: number
  contextRounds: number
}

const props = defineProps<{
  modelOptions: Array<{ label: string; value: number }>
  loading: boolean
  settings: ModelSettings
  selectedLlmId: number | null
}>()

const emit = defineEmits<{
  'update:selectedLlmId': [value: number | null]
  'update:settings': [value: ModelSettings]
}>()

const settingsDraft = reactive<ModelSettings>({ ...props.settings })
const selectedModel = computed({
  get: () => props.selectedLlmId,
  set: (value: number | null) => emit('update:selectedLlmId', value),
})

function isSameSettings(left: ModelSettings, right: ModelSettings) {
  return (
    left.temperature === right.temperature &&
    left.topP === right.topP &&
    left.presencePenalty === right.presencePenalty &&
    left.frequencyPenalty === right.frequencyPenalty &&
    left.contextRounds === right.contextRounds
  )
}

watch(
  () => props.settings,
  (value) => {
    if (!isSameSettings(settingsDraft, value)) {
      Object.assign(settingsDraft, value)
    }
  },
  { deep: true },
)
watch(
  settingsDraft,
  (value) => {
    if (!isSameSettings(value, props.settings)) {
      emit('update:settings', { ...value })
    }
  },
  { deep: true },
)
</script>

<template>
  <section class="model-settings">
    <h3>模型设置</h3>
    <label class="model-settings__field">
      <span>模型</span>
      <Select
        v-model:value="selectedModel"
        :options="modelOptions"
        :loading="loading"
        allow-clear
        placeholder="请选择模型"
      />
    </label>
    <div class="model-settings__group">
      <span>参数</span>
      <label class="model-settings__row">
        <span>温度</span>
        <Slider v-model:value="settingsDraft.temperature" :min="0" :max="2" :step="0.01" />
        <div class="model-settings__number">
          <InputNumber
            v-model:value="settingsDraft.temperature"
            :min="0"
            :max="2"
            :step="0.01"
          />
        </div>
      </label>
      <label class="model-settings__row">
        <span>Top P</span>
        <Slider v-model:value="settingsDraft.topP" :min="0" :max="1" :step="0.01" />
        <div class="model-settings__number">
          <InputNumber v-model:value="settingsDraft.topP" :min="0" :max="1" :step="0.01" />
        </div>
      </label>
      <label class="model-settings__row">
        <span>存在惩罚</span>
        <Slider
          v-model:value="settingsDraft.presencePenalty"
          :min="0"
          :max="2"
          :step="0.01"
        />
        <div class="model-settings__number">
          <InputNumber
            v-model:value="settingsDraft.presencePenalty"
            :min="0"
            :max="2"
            :step="0.01"
          />
        </div>
      </label>
      <label class="model-settings__row">
        <span>频率惩罚</span>
        <Slider
          v-model:value="settingsDraft.frequencyPenalty"
          :min="0"
          :max="2"
          :step="0.01"
        />
        <div class="model-settings__number">
          <InputNumber
            v-model:value="settingsDraft.frequencyPenalty"
            :min="0"
            :max="2"
            :step="0.01"
          />
        </div>
      </label>
    </div>
    <div class="model-settings__group">
      <span>输入和输出设置</span>
      <label class="model-settings__row">
        <span>携带上下文轮数</span>
        <Slider v-model:value="settingsDraft.contextRounds" :min="1" :max="100" :step="1" />
        <div class="model-settings__number">
          <InputNumber
            v-model:value="settingsDraft.contextRounds"
            :min="1"
            :max="100"
            :step="1"
            :precision="0"
          />
        </div>
      </label>
    </div>
  </section>
</template>

<style scoped lang="scss">
.model-settings {
  --color-primary: var(--primary-color);
  --color-text: var(--font-color);
  --color-text-strong: var(--font-active-color);
  --color-text-muted: var(--font-light-color);
  --color-bg-soft: var(--touch-bg);
  --radius-md: 0.8rem;
  --space-1: 0.4rem;
  --space-2: 0.8rem;
  --space-3: 1.2rem;
  --space-4: 1.6rem;

  width: 47.2rem;
  max-width: calc(100vw - 4.8rem);
}

.model-settings h3 {
  margin: 0 0 var(--space-4);
  color: var(--color-text-strong);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.model-settings__field,
.model-settings__group,
.model-settings__row {
  display: grid;
  min-width: 0;
}

.model-settings__field {
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.model-settings__field > span,
.model-settings__group > span {
  color: var(--color-text-strong);
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.8rem;
}

.model-settings__group {
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.model-settings__row {
  grid-template-columns: 8.8rem minmax(16.8rem, 1fr) 9.6rem;
  align-items: center;
  gap: var(--space-3);
}

.model-settings__row > span {
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.6rem;
}

.model-settings__number {
  width: 9.6rem;
}
</style>
