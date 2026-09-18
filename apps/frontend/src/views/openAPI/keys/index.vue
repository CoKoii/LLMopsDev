<script setup lang="ts">
import {
  createOpenApiKeyApi,
  deleteOpenApiKeyApi,
  listOpenApiKeysApi,
  updateOpenApiKeyApi,
  type OpenApiKeyItem,
} from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import { Check, Copy, Ellipsis, KeyRound } from '@lucide/vue'
import {
  Badge,
  Button,
  Dropdown,
  Empty,
  message,
  Modal,
  Space,
  Switch,
  Table,
  TextArea,
} from 'antdv-next'
import { onMounted, reactive, ref, watch } from 'vue'

const props = defineProps<{ createRequest?: number }>()
const loading = ref(false)
const saving = ref(false)
const keys = ref<OpenApiKeyItem[]>([])
const formOpen = ref(false)
const editing = ref<OpenApiKeyItem>()
const revealedSecret = ref('')
const secretOpen = ref(false)
const copied = ref(false)
const form = reactive({ status: true, remark: '' })

const columns = [
  { title: '密钥', dataIndex: 'key', key: 'key', ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 130 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 190 },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  { title: '操作', key: 'operation', width: 120, align: 'center' as const },
]

const actionItems = [
  { key: 'edit', label: '编辑' },
  { type: 'divider' as const },
  { key: 'delete', label: '删除', danger: true },
]

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

async function loadKeys() {
  loading.value = true
  try {
    keys.value = await listOpenApiKeysApi()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = undefined
  form.status = true
  form.remark = ''
  formOpen.value = true
}

function openEdit(record: OpenApiKeyItem) {
  editing.value = record
  form.status = record.status
  form.remark = record.remark
  formOpen.value = true
}

async function saveKey() {
  saving.value = true
  try {
    if (editing.value) {
      await updateOpenApiKeyApi(editing.value.id, form)
      message.success('密钥已更新')
    } else {
      const created = await createOpenApiKeyApi(form)
      revealedSecret.value = created.secret
      secretOpen.value = true
      message.success('密钥已创建')
    }
    formOpen.value = false
    await loadKeys()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(record: OpenApiKeyItem, status: boolean) {
  await updateOpenApiKeyApi(record.id, { status })
  record.status = status
  message.success(status ? '密钥已启用' : '密钥已禁用')
}

function confirmDelete(record: OpenApiKeyItem) {
  Modal.confirm({
    title: '删除密钥',
    content: '删除后，使用该密钥的所有调用将立即失败，且无法恢复。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    async onOk() {
      await deleteOpenApiKeyApi(record.id)
      message.success('密钥已删除')
      await loadKeys()
    },
  })
}

function handleAction(event: { key: string | number }, record: OpenApiKeyItem) {
  if (event.key === 'edit') openEdit(record)
  if (event.key === 'delete') confirmDelete(record)
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(revealedSecret.value)
    copied.value = true
    message.success('密钥已复制')
    window.setTimeout(() => (copied.value = false), 1500)
  } catch {
    message.error('复制失败，请手动复制密钥')
  }
}

watch(
  () => props.createRequest,
  (value) => {
    if (value !== undefined) openCreate()
  },
)
watch(secretOpen, (open) => {
  if (!open) {
    revealedSecret.value = ''
    copied.value = false
  }
})
onMounted(loadKeys)
</script>

<template>
  <main class="key-page">
    <Table
      row-key="id"
      :columns="columns"
      :data-source="keys"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 880 }"
    >
      <template #emptyText>
        <Empty description="暂无 API 密钥">
          <template #image><KeyRound :size="42" /></template>
        </Empty>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'key'">
          <span class="key-value">{{ record.key }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Badge
            :status="record.status ? 'success' : 'default'"
            :text="record.status ? '可用' : '已禁用'"
          />
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDateTime(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'remark'">
          {{ record.remark || '-' }}
        </template>
        <template v-else-if="column.key === 'operation'">
          <Space>
            <Switch
              size="small"
              :checked="record.status"
              @change="(checked: unknown) => toggleStatus(record, checked === true)"
            />
            <Dropdown
              :trigger="['click']"
              :menu="{ items: actionItems }"
              @menu-click="(event) => handleAction(event, record)"
            >
              <Button type="text" shape="circle" title="更多操作" aria-label="更多操作">
                <template #icon><Ellipsis :size="16" /></template>
              </Button>
            </Dropdown>
          </Space>
        </template>
      </template>
    </Table>

    <AppModal
      v-model:open="formOpen"
      :title="editing ? '编辑密钥' : '新增密钥'"
      width="52rem"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="saveKey"
    >
      <div class="key-form">
        <label>
          <span>密钥状态 <i>*</i></span>
          <Switch v-model:checked="form.status" size="small" />
        </label>
        <label>
          <span>密钥备注</span>
          <TextArea
            v-model:value="form.remark"
            :maxlength="2000"
            :rows="3"
            show-count
            placeholder="请输入密钥备注，用于描述使用场景"
          />
        </label>
      </div>
    </AppModal>

    <AppModal
      v-model:open="secretOpen"
      title="密钥创建成功"
      width="56rem"
      :footer="null"
      :mask-closable="false"
    >
      <div class="secret-result">
        <p>请立即保存该密钥。关闭窗口后，平台将不再展示完整内容。</p>
        <div>
          <code>{{ revealedSecret }}</code>
          <Button title="复制密钥" aria-label="复制密钥" @click="copySecret">
            <template #icon>
              <Check v-if="copied" :size="15" />
              <Copy v-else :size="15" />
            </template>
          </Button>
        </div>
        <Button type="primary" @click="secretOpen = false">我已保存</Button>
      </div>
    </AppModal>
  </main>
</template>

<style scoped lang="scss">
.key-page {
  min-height: 100%;
  padding: 0;
  background: var(--white);
}

.key-value {
  color: var(--font-color);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.key-form {
  display: grid;
  gap: 2rem;
  padding: 0.8rem 0;
}

.key-form label {
  display: grid;
  gap: 0.8rem;
  color: var(--font-active-color);
  font-size: 1.4rem;
}

.key-form label:first-child {
  justify-items: start;
}

.key-form i {
  color: #dc2626;
  font-style: normal;
}

.secret-result {
  display: grid;
  gap: 1.6rem;
}

.secret-result p {
  margin: 0;
  color: #9a3412;
  line-height: 2rem;
}

.secret-result > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
}

.secret-result code {
  min-width: 0;
  padding: 1rem 1.2rem;
  overflow: auto;
  color: var(--font-active-color);
  background: var(--touch-bg);
  border: 0.1rem solid var(--border-color);
  border-radius: 0.6rem;
  font-size: 1.3rem;
  white-space: nowrap;
}

.secret-result > button {
  justify-self: end;
}
</style>
