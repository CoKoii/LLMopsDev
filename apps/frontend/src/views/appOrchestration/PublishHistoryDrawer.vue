<script setup lang="ts">
import type { AiAppVersionItem } from '@/api'
import { Bot, RotateCcw } from '@lucide/vue'
import { Button, Drawer, Tag } from 'antdv-next'

defineProps<{
  open: boolean
  appName: string
  appAvatar: string
  description: string
  lastEditedAt?: string
  versions: AiAppVersionItem[]
  loading: boolean
  formatDateTime: (value?: string | null) => string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  restore: [value: number]
}>()
</script>

<template>
  <Drawer
    :open="open"
    title="历史版本"
    placement="right"
    :size="420"
    :closable="{ placement: 'end' }"
    @update:open="emit('update:open', $event)"
  >
    <div class="publish-history">
      <div class="publish-history__app">
        <div class="publish-history__icon" :class="{ 'has-image': appAvatar }">
          <img v-if="appAvatar" :src="appAvatar" alt="" />
          <Bot v-else :size="18" />
        </div>
        <div>
          <strong>{{ appName }}</strong>
          <span>最近编辑：{{ formatDateTime(lastEditedAt) }}</span>
        </div>
      </div>
      <p class="publish-history__description">{{ description || '暂无应用描述' }}</p>
      <p class="publish-history__count">共计 {{ versions.length }} 条发布记录</p>
      <div class="publish-history__list">
        <div v-if="loading">正在加载历史版本...</div>
        <article
          v-else
          v-for="item in versions"
          :key="item.id"
          class="publish-history__item"
        >
          <div class="publish-history__item-main">
            <div>
              <strong>版本</strong>
              <Tag>{{ item.version }}</Tag>
              <Tag v-if="item.standaloneActive">独立页当前版本</Tag>
            </div>
            <span>发布时间: {{ formatDateTime(item.publishedAt || item.createdAt) }}</span>
          </div>
          <Button size="small" :disabled="item.standaloneActive" @click="emit('restore', item.id)">
            <template #icon><RotateCcw :size="13" /></template>
            回退
          </Button>
        </article>
      </div>
    </div>
  </Drawer>
</template>

<style scoped lang="scss">
.publish-history {
  --color-primary: var(--primary-color);
  --color-text-strong: var(--font-active-color);
  --color-text-muted: var(--font-light-color);
  --color-bg-panel: var(--white);
  --color-border-light: var(--border-color);
  --color-white: var(--white);
  --radius-md: 0.8rem;
  --space-1: 0.4rem;
  --space-3: 1.2rem;
  --space-4: 1.6rem;
  --space-6: 2.4rem;

  display: grid;
  gap: var(--space-4);
}

.publish-history__app {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.publish-history__icon {
  display: grid;
  width: 4rem;
  height: 4rem;
  place-items: center;
  overflow: hidden;
  color: var(--color-white);
  border-radius: var(--radius-md);
}

.publish-history__icon:not(.has-image) {
  background: var(--color-primary);
}

.publish-history__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.publish-history__app strong,
.publish-history__item strong {
  color: var(--color-text-strong);
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
}

.publish-history__app span,
.publish-history__description,
.publish-history__count,
.publish-history__state,
.publish-history__item span {
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 2rem;
}

.publish-history__app span {
  display: block;
}

.publish-history__description {
  margin: 0;
  padding-bottom: var(--space-3);
  border-bottom: 0.1rem solid var(--color-border-light);
}

.publish-history__count {
  margin: 0;
}

.publish-history__state {
  margin: 0;
  padding: var(--space-6) 0;
  text-align: center;
}

.publish-history__list {
  display: grid;
  gap: var(--space-3);
}

.publish-history__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.publish-history__item-main {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}

.publish-history__item-main > div {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
