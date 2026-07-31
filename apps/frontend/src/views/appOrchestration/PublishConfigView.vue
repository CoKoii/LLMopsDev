<script setup lang="ts">
import {
  getAiAppPublishConfigApi,
  publishAiAppConfigApi,
  unpublishAiAppConfigApi,
  type AiAppPublishConfig,
} from '@/api'
import { CircleCheck, CircleX, Copy, ExternalLink, Globe2, LockKeyhole } from '@lucide/vue'
import { Button, Input, Modal, Spin, Tag, message } from 'antdv-next'
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  appId: number
  refreshKey: number
}>()

const config = ref<AiAppPublishConfig>()
const loading = ref(false)
const updating = ref(false)
const appUrl = computed(() => `${window.location.origin}/apps/chat/${props.appId}`)
const currentVersionName = computed(() => config.value?.version?.version || '-')

async function loadConfig() {
  loading.value = true
  try {
    config.value = await getAiAppPublishConfigApi(props.appId)
  } finally {
    loading.value = false
  }
}

async function doPublishApp() {
  updating.value = true
  try {
    config.value = await publishAiAppConfigApi(props.appId)
    message.success('独立对话页已发布')
  } finally {
    updating.value = false
  }
}

async function doUnpublishApp() {
  updating.value = true
  try {
    config.value = await unpublishAiAppConfigApi(props.appId)
    message.success('独立对话页已取消发布')
  } finally {
    updating.value = false
  }
}

function confirmPublishApp() {
  Modal.confirm({
    title: '发布独立对话页',
    content: '发布后，其他登录用户也可以访问该独立对话页并发起对话。确定发布吗？',
    okText: '发布',
    cancelText: '取消',
    centered: true,
    onOk: doPublishApp,
  })
}

function confirmUnpublishApp() {
  Modal.confirm({
    title: '取消发布独立对话页',
    content: '取消发布后，其他用户将不能继续访问该独立对话页。确定取消发布吗？',
    okText: '取消发布',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: doUnpublishApp,
  })
}

async function copyUrl() {
  await navigator.clipboard.writeText(appUrl.value)
  message.success('访问地址已复制')
}

function visitApp() {
  window.open(appUrl.value, '_blank', 'noopener,noreferrer')
}

watch(
  [() => props.appId, () => props.refreshKey],
  () => {
    void loadConfig()
  },
)

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <main class="publish-config">
    <div class="publish-config__notice">
      保存过版本后会生成独立对话页地址。未公开时仅创建者可访问，公开后其他登录用户也可访问。
    </div>

    <Spin :spinning="loading">
      <div class="publish-config__table" role="table" aria-label="发布配置">
        <div class="publish-config__head" role="row">
          <span role="columnheader">发布渠道</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">操作</span>
        </div>

        <article class="publish-config__row" role="row">
          <div class="publish-config__channel" role="cell">
            <div class="publish-config__icon">
              <Globe2 :size="18" />
            </div>
            <div>
              <strong>网页版独立对话页</strong>
              <span>当前对话版本：{{ currentVersionName }}</span>
            </div>
          </div>

          <div class="publish-config__status" role="cell">
            <Tag v-if="config?.published" color="processing">
              <template #icon><CircleCheck :size="13" /></template>
              已发布
            </Tag>
            <Tag v-else>
              <template #icon><LockKeyhole :size="13" /></template>
              未发布
            </Tag>
          </div>

          <div class="publish-config__operation" role="cell">
            <Input class="publish-config__link" :value="appUrl" readonly />
            <Button :disabled="!config?.hasVersion" @click="copyUrl">
              <template #icon><Copy :size="15" /></template>
            </Button>
            <Button :disabled="!config?.hasVersion" @click="visitApp">
              <template #icon><ExternalLink :size="15" /></template>
              访问
            </Button>
            <Button
              v-if="config?.published"
              :loading="updating"
              :disabled="!config?.hasVersion"
              @click="confirmUnpublishApp"
            >
              <template #icon><CircleX :size="15" /></template>
              取消发布
            </Button>
            <Button
              v-else
              type="primary"
              :loading="updating"
              :disabled="!config?.hasVersion"
              @click="confirmPublishApp"
            >
              <template #icon><CircleCheck :size="15" /></template>
              发布
            </Button>
          </div>
        </article>
      </div>
    </Spin>
  </main>
</template>

<style scoped lang="scss">
.publish-config,
.publish-config *,
.publish-config *::before,
.publish-config *::after {
  box-sizing: border-box;
}

.publish-config {
  flex: 1;
  min-height: 0;
  padding: 2.4rem;
  overflow-y: auto;
}

.publish-config__notice {
  min-height: 3.6rem;
  padding: 0.9rem var(--space-4);
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 1.8rem;
  background: var(--color-primary-tint);
  border-radius: var(--radius-md);
}

.publish-config__table {
  display: grid;
  margin-top: 2rem;
}

.publish-config__head,
.publish-config__row {
  display: grid;
  grid-template-columns: minmax(34rem, 40%) minmax(12rem, 12%) minmax(42rem, 1fr);
  align-items: center;
}

.publish-config__head {
  min-height: 4.6rem;
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 2rem;
  background: var(--color-bg-soft);
}

.publish-config__head span {
  padding: 0 var(--space-4);
}

.publish-config__row {
  min-height: 7.2rem;
  border-bottom: 0.1rem solid var(--color-border-light);
}

.publish-config__channel,
.publish-config__operation {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
  padding: 0 var(--space-4);
}

.publish-config__icon {
  display: grid;
  width: 3.6rem;
  height: 3.6rem;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-primary);
  background: #e0f2fe;
  border-radius: var(--radius-md);
}

.publish-config__channel strong {
  display: block;
  color: var(--color-text-strong);
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
}

.publish-config__channel span {
  display: block;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  line-height: 1.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-config__status {
  padding: 0 var(--space-4);
}

.publish-config__operation {
  justify-content: flex-start;
}

.publish-config__link {
  min-width: 24rem;
  max-width: 36rem;
}

@media (max-width: 760px) {
  .publish-config__head {
    display: none;
  }

  .publish-config__row {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    align-items: start;
    padding: var(--space-4) 0;
  }

  .publish-config__status,
  .publish-config__operation {
    padding: 0 var(--space-4);
  }

  .publish-config__operation {
    flex-wrap: wrap;
  }
}
</style>
