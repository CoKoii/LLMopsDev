<script setup lang="ts">
import { Bot, ChevronDown, Clock3, Copy, History, User } from '@lucide/vue'
import { Button, Tag } from 'antdv-next'

type PageTab = {
  page: string
  label: string
}

defineProps<{
  tabs: readonly PageTab[]
  activePage: string
  appId: string | number
  appName: string
  appAvatar: string
  autoSaveText: string
  publishing: boolean
}>()

const emit = defineEmits<{
  openHistory: []
  publish: []
}>()
</script>

<template>
  <header class="workspace-topbar">
    <div class="workspace-topbar__entity">
      <div class="workspace-topbar__logo" :class="{ 'has-image': appAvatar }">
        <img v-if="appAvatar" :src="appAvatar" alt="" />
        <Bot v-else :size="18" />
      </div>
      <div class="workspace-topbar__identity">
        <div>
          <h1>{{ appName }}</h1>
          <Copy :size="14" />
        </div>
        <p>
          <User :size="13" />
          <span>个人空间</span>
          <Clock3 :size="13" />
          <span>草稿</span>
          <Tag color="processing">{{ autoSaveText }}</Tag>
        </p>
      </div>
    </div>

    <div class="workspace-topbar__center">
      <nav class="app-orchestration__tabs" role="tablist" aria-label="应用编排页面">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.page"
          v-slot="{ href, navigate }"
          :to="{ name: 'app-orchestration', params: { appId, page: tab.page } }"
          custom
        >
          <a
            class="app-orchestration__tab"
            :class="{ 'is-active': activePage === tab.page }"
            :href="href"
            role="tab"
            :aria-selected="activePage === tab.page"
            @click="navigate"
          >
            {{ tab.label }}
          </a>
        </RouterLink>
      </nav>
    </div>

    <div class="workspace-topbar__actions">
      <Button shape="circle" aria-label="历史版本" @click="emit('openHistory')">
        <template #icon><History :size="18" /></template>
      </Button>
      <div class="publish-action">
        <Button class="publish-action__main" type="primary" :loading="publishing" @click="emit('publish')">
          保存版本
        </Button>
        <Button class="publish-action__toggle" type="primary" aria-label="发布操作">
          <ChevronDown :size="14" />
        </Button>
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.workspace-topbar,
.workspace-topbar *,
.workspace-topbar *::before,
.workspace-topbar *::after {
  box-sizing: border-box;
}

.workspace-topbar {
  display: grid;
  grid-template-columns: minmax(25.6rem, 1fr) auto minmax(25.6rem, 1fr);
  align-items: center;
  height: 7.2rem;
  padding: 0 2.4rem 0 1.6rem;
  background: var(--color-bg-sidebar);
  border-bottom: 0.1rem solid var(--color-border-light);
}

.workspace-topbar__entity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
}

.workspace-topbar__logo {
  display: grid;
  width: 4rem;
  height: 4rem;
  place-items: center;
  flex: 0 0 auto;
  color: var(--color-white);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

.workspace-topbar__logo.has-image {
  overflow: hidden;
  background: var(--color-bg-soft) !important;
}

.workspace-topbar__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace-topbar__identity {
  min-width: 0;
}

.workspace-topbar__identity > div,
.workspace-topbar__identity p {
  display: flex;
  align-items: center;
  min-width: 0;
}

.workspace-topbar__identity > div {
  gap: var(--space-1);
}

.workspace-topbar__identity h1 {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-topbar__identity p {
  margin: 0.2rem 0 0;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.6rem;
}

.workspace-topbar__center {
  align-self: center;
}

.workspace-topbar__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.app-orchestration__tabs {
  display: flex;
  align-items: stretch;
  align-self: center;
  height: 4.8rem;
}

.app-orchestration__tab {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 8rem;
  padding: 0 var(--space-4);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 1.4rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.16s ease;
}

.app-orchestration__tab::after {
  position: absolute;
  right: var(--space-3);
  bottom: 0;
  left: var(--space-3);
  height: 0.2rem;
  background: var(--color-primary);
  border-radius: var(--radius-pill);
  content: '';
  opacity: 0;
  transform: scaleX(0.5);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.app-orchestration__tab:hover,
.app-orchestration__tab:focus-visible,
.app-orchestration__tab.is-active {
  color: var(--color-primary);
}

.app-orchestration__tab:focus-visible {
  outline: 0.2rem solid var(--color-primary-soft);
  outline-offset: -0.2rem;
}

.app-orchestration__tab.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

.publish-action {
  display: inline-flex;
  align-items: stretch;
}

.publish-action__main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.publish-action__toggle {
  width: 2.4rem;
  padding-right: 0;
  padding-left: 0;
  border-left-width: 0.2rem;
  border-left-color: var(--color-border);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

@media (max-width: 1180px) {
  .workspace-topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    height: auto;
    min-height: 7.2rem;
    gap: var(--space-3);
  }

  .workspace-topbar__center {
    grid-column: 1 / -1;
    order: 3;
  }

  .workspace-topbar__actions {
    justify-content: flex-end;
  }
}

@media (max-width: 700px) {
  .workspace-topbar {
    padding: var(--space-3) var(--space-4);
  }

  .workspace-topbar__actions {
    grid-column: 1 / -1;
    justify-content: stretch;
    flex-wrap: wrap;
  }
}

@media (max-width: 560px) {
  .app-orchestration__tab {
    min-width: 0;
    flex: 1;
    padding: 0 var(--space-2);
  }
}
</style>
