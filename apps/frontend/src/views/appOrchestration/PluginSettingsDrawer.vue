<script setup lang="ts">
import type { AppPluginOperationSettings, PluginItem } from '@/api'
import { parseOpenApiTools, type ParsedOpenApiParameter } from '@/utils/openapiTools'
import { Database, Info } from '@lucide/vue'
import {
  Button,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  Switch,
  TextArea,
  Tooltip,
} from 'antdv-next'
import { computed, ref, watch } from 'vue'

type PluginOperationSettings = Record<string, AppPluginOperationSettings>
type PluginSettingField = ParsedOpenApiParameter & {
  operationId: string
}

const props = defineProps<{
  open: boolean
  plugin?: PluginItem
  settings: PluginOperationSettings
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [pluginId: number, settings: PluginOperationSettings]
}>()

const activeTab = ref<'info' | 'settings'>('info')
const draftSettings = ref<PluginOperationSettings>({})
const tabs = [
  { key: 'info', label: '信息' },
  { key: 'settings', label: '设置' },
] as const

const tools = computed(() => parseOpenApiTools(props.plugin?.openapiSchema ?? ''))
const hasExplicitConfigurableFields = computed(() =>
  tools.value.some((tool) =>
    tool.parameters.some((parameter) => parameter.configurable !== undefined),
  ),
)
const settingFields = computed<PluginSettingField[]>(() =>
  tools.value.flatMap((tool) =>
    tool.parameters
      .filter(
        (parameter) =>
          !parameter.required &&
          parameter.in !== 'path' &&
          (!hasExplicitConfigurableFields.value || parameter.configurable === true),
      )
      .map((parameter) => ({
        ...parameter,
        operationId: tool.name,
      })),
  ),
)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cloneSettings = (settings: PluginOperationSettings): PluginOperationSettings =>
  JSON.parse(JSON.stringify(settings ?? {})) as PluginOperationSettings

function getOperationSettings(operationId: string) {
  const current = draftSettings.value[operationId]
  if (current) return current

  const next: AppPluginOperationSettings = {}
  draftSettings.value = {
    ...draftSettings.value,
    [operationId]: next,
  }
  return next
}

function getFieldValue(field: PluginSettingField) {
  const operationSettings = draftSettings.value[field.operationId]
  if (!operationSettings) return undefined

  if (field.in === 'body') {
    return isRecord(operationSettings.body) ? operationSettings.body[field.name] : undefined
  }

  return operationSettings[field.name]
}

function getStringFieldValue(field: PluginSettingField) {
  const value = getFieldValue(field)
  return typeof value === 'string' ? value : undefined
}

function getNumberFieldValue(field: PluginSettingField) {
  const value = getFieldValue(field)
  return typeof value === 'number' ? value : undefined
}

function getBooleanFieldValue(field: PluginSettingField) {
  return getFieldValue(field) === true
}

function getComplexFieldValue(field: PluginSettingField) {
  const value = getFieldValue(field)
  if (value === undefined || value === null || value === '') return ''
  return JSON.stringify(value, null, 2)
}

function setFieldValue(field: PluginSettingField, value: unknown) {
  const operationSettings = getOperationSettings(field.operationId)

  if (field.in === 'body') {
    const body = isRecord(operationSettings.body) ? { ...operationSettings.body } : {}
    body[field.name] = value
    operationSettings.body = body
    return
  }

  operationSettings[field.name] = value
}

function setComplexFieldValue(field: PluginSettingField, value: string) {
  const content = value.trim()
  if (!content) {
    setFieldValue(field, undefined)
    return
  }

  try {
    setFieldValue(field, JSON.parse(content))
  } catch {
    setFieldValue(field, value)
  }
}

function setStringFieldValue(field: PluginSettingField, value: string) {
  const content = value.trim()
  setFieldValue(field, content || undefined)
}

function setNumberFieldValue(field: PluginSettingField, value: number | null) {
  setFieldValue(field, typeof value === 'number' ? value : undefined)
}

function applySchemaDefaults() {
  for (const field of settingFields.value) {
    if (field.defaultValue === undefined || getFieldValue(field) !== undefined) continue
    setFieldValue(field, field.defaultValue)
  }
}

function formatOptionLabel(value: string | number | boolean) {
  return typeof value === 'boolean' ? (value ? '是' : '否') : String(value)
}

function hasSelectOptions(field: PluginSettingField) {
  return (
    field.enumValues?.length &&
    field.enumValues.every((value) => typeof value === 'string' || typeof value === 'number')
  )
}

function createEnumOptions(field: PluginSettingField) {
  return (field.enumValues ?? [])
    .filter(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    )
    .map((value) => ({
      label: formatOptionLabel(value),
      value,
    }))
}

function getFieldLabel(field: PluginSettingField) {
  return field.configLabel || field.name
}

function getFieldDescription(field: PluginSettingField) {
  if (field.description && field.description !== '-') return field.description
  return field.name
}

function handleSave() {
  if (!props.plugin) return
  emit('save', props.plugin.id, cloneSettings(draftSettings.value))
  emit('update:open', false)
}

watch(
  () => [props.open, props.plugin?.id, props.settings] as const,
  ([open]) => {
    if (!open) return
    activeTab.value = 'info'
    draftSettings.value = cloneSettings(props.settings)
    applySchemaDefaults()
  },
  { deep: true },
)
</script>

<template>
  <Drawer
    :open="open"
    placement="right"
    :size="404"
    :closable="{ placement: 'end' }"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="plugin-settings__titlebar">
        <span class="plugin-settings__icon" :class="{ 'has-image': plugin?.icon }">
          <img v-if="plugin?.icon" :src="plugin.icon" alt="" />
          <Database v-else :size="14" />
        </span>
        <strong>{{ plugin?.name || '插件设置' }}</strong>
        <div class="plugin-settings__tabs" role="tablist" aria-label="插件设置面板">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            class="plugin-settings__tab"
            :class="{ 'is-active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </template>

    <div class="plugin-settings" :class="{ 'is-loading': loading }">
      <div v-if="activeTab === 'info'" class="plugin-settings__info">
        <p class="plugin-settings__description">{{ plugin?.description || '暂无描述' }}</p>
        <section
          v-for="tool in tools"
          :key="`${tool.method}-${tool.path}`"
          class="plugin-settings__tool"
        >
          <div class="plugin-settings__tool-header">
            <h3>{{ tool.name }}</h3>
            <p v-if="tool.description">{{ tool.description }}</p>
          </div>
          <div class="plugin-settings__path">
            <span class="plugin-settings__method">{{ tool.method.toUpperCase() }}</span>
            <code>{{ tool.path }}</code>
          </div>
          <div v-if="tool.parameters.length" class="plugin-settings__params">
            <div
              v-for="parameter in tool.parameters"
              :key="`${tool.name}-${parameter.in}-${parameter.name}`"
              class="plugin-settings__param"
            >
              <div class="plugin-settings__param-title">
                <strong>{{ parameter.name }}</strong>
                <em v-if="parameter.required">必填</em>
              </div>
              <div class="plugin-settings__param-meta">
                <span>{{ parameter.in }}</span>
                <span>{{ parameter.type }}</span>
              </div>
              <p v-if="parameter.description">{{ parameter.description }}</p>
            </div>
          </div>
        </section>
        <div v-if="!tools.length" class="plugin-settings__empty">暂无可用工具</div>
      </div>

      <Form v-else-if="settingFields.length" layout="vertical" class="plugin-settings__form">
        <FormItem
          v-for="field in settingFields"
          :key="`${field.operationId}-${field.in}-${field.name}`"
          class="plugin-settings__form-item"
          :required="field.required"
        >
          <template #label>
            <span class="plugin-settings__label">
              {{ getFieldLabel(field) }}
              <Tooltip :title="getFieldDescription(field)" :trigger="['hover', 'click']">
                <button
                  type="button"
                  class="plugin-settings__hint"
                  :aria-label="`${getFieldLabel(field)}说明`"
                >
                  <Info :size="12" />
                </button>
              </Tooltip>
            </span>
          </template>

          <Select
            v-if="hasSelectOptions(field)"
            :value="getFieldValue(field)"
            :options="createEnumOptions(field)"
            class="plugin-settings__control"
            allow-clear
            @update:value="setFieldValue(field, $event)"
          />
          <Switch
            v-else-if="field.type === 'boolean'"
            :checked="getBooleanFieldValue(field)"
            @update:checked="setFieldValue(field, $event)"
          />
          <InputNumber
            v-else-if="field.type === 'integer' || field.type === 'number'"
            :value="getNumberFieldValue(field)"
            :min="field.minimum"
            :max="field.maximum"
            :step="field.multipleOf || (field.type === 'integer' ? 1 : 0.01)"
            :controls="false"
            class="plugin-settings__control"
            @update:value="setNumberFieldValue(field, $event)"
          />
          <TextArea
            v-else-if="field.type === 'array' || field.type === 'object'"
            :value="getComplexFieldValue(field)"
            :rows="3"
            class="plugin-settings__control"
            allow-clear
            @update:value="setComplexFieldValue(field, String($event ?? ''))"
          />
          <Input
            v-else
            :value="getStringFieldValue(field)"
            :maxlength="field.maxLength"
            class="plugin-settings__control"
            allow-clear
            @update:value="setStringFieldValue(field, $event)"
          />
        </FormItem>
      </Form>
      <div v-else class="plugin-settings__empty">当前插件没有可配置的可选参数</div>
    </div>

    <template #footer>
      <div class="plugin-settings__footer">
        <Button @click="emit('update:open', false)">取消</Button>
        <Button type="primary" @click="handleSave">保存</Button>
      </div>
    </template>
  </Drawer>
</template>

<style scoped lang="scss">
.plugin-settings__titlebar {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 0.8rem;
}

.plugin-settings__titlebar strong {
  overflow: hidden;
  max-width: 14rem;
  color: #1f2937;
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-settings__icon {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 0.4rem;
  background: #eef2f7;
  color: #5f6775;
}

.plugin-settings__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plugin-settings__tabs {
  display: flex;
  align-items: center;
  gap: 1.8rem;
  margin-left: 1.6rem;
}

.plugin-settings__tab {
  position: relative;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3f4652;
  cursor: pointer;
  font: inherit;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 2rem;
}

.plugin-settings__tab::after {
  position: absolute;
  right: 0;
  bottom: -0.6rem;
  left: 0;
  height: 0.2rem;
  border-radius: 999px;
  background: transparent;
  content: '';
}

.plugin-settings__tab.is-active {
  color: #2563eb;
}

.plugin-settings__tab.is-active::after {
  background: #2563eb;
}

.plugin-settings.is-loading {
  opacity: 0.62;
}

.plugin-settings__form-item {
  margin-bottom: 1.2rem;
}

.plugin-settings__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #202938;
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.8rem;
}

.plugin-settings__hint {
  display: grid;
  padding: 0;
  border: 0;
  background: transparent;
  color: #697386;
  cursor: pointer;
  place-items: center;
}

.plugin-settings__hint svg {
  color: #697386;
}

.plugin-settings__control {
  width: 100%;
}

.plugin-settings__description,
.plugin-settings__empty {
  color: #6b7280;
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.plugin-settings__description {
  margin: 0;
  color: #5f6877;
  font-size: 1.3rem;
  line-height: 2rem;
}

.plugin-settings__info {
  display: grid;
  gap: 1.6rem;
}

.plugin-settings__tool {
  padding-bottom: 1.6rem;
  border-bottom: 0.1rem solid #edf0f4;
}

.plugin-settings__tool:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.plugin-settings__tool-header h3 {
  margin: 0 0 0.4rem;
  color: #202938;
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 2rem;
}

.plugin-settings__tool-header p,
.plugin-settings__param p {
  margin: 0;
  color: #6b7280;
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.plugin-settings__path {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1rem;
  color: #7b8493;
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.plugin-settings__method {
  color: #1d4ed8;
  font-weight: 700;
}

.plugin-settings__path code {
  overflow: hidden;
  color: #667085;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-settings__params {
  display: grid;
  gap: 1.2rem;
  margin-top: 1.4rem;
}

.plugin-settings__param {
  display: grid;
  gap: 0.4rem;
}

.plugin-settings__param-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.plugin-settings__param-title strong {
  overflow: hidden;
  color: #273244;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-settings__param-title em {
  padding: 0 0.4rem;
  border-radius: 0.3rem;
  background: #fff1f0;
  color: #d92d20;
  flex: none;
  font-size: 1.1rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.6rem;
}

.plugin-settings__param-meta {
  display: flex;
  gap: 0.6rem;
  color: #7b8493;
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.plugin-settings__param-meta span + span::before {
  margin-right: 0.6rem;
  color: #c0c6d0;
  content: '/';
}

.plugin-settings__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
}
</style>
