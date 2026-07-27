<script setup lang="ts">
import type { KnowledgeItem, PluginItem } from '@/api'
import { BookOpen, CircleCheck, Database, Plus, User, X } from '@lucide/vue'
import { Button } from 'antdv-next'
import { onBeforeUnmount, ref, watch, type Component } from 'vue'

type PluginSourceKey = 'custom' | 'category'

type PluginCategoryOption = {
  key: string
  name: string
  icon: Component
}

type PluginGroup = {
  key: string
  title: string
  items: PluginItem[]
}

const props = defineProps<{
  pluginOpen: boolean
  knowledgeOpen: boolean
  activePluginSourceKey: PluginSourceKey
  activePluginCategoryKey: string
  pluginCategoryOptions: PluginCategoryOption[]
  activePluginSourceName: string
  pluginCatalogLoading: boolean
  pluginGroups: PluginGroup[]
  selectedPluginIds: Set<number>
  pluginEmptyText: string
  knowledgeCatalogLoading: boolean
  knowledgeCatalog: KnowledgeItem[]
  selectedKnowledgeIds: Set<number>
  knowledgeEmptyText: string
}>()

const emit = defineEmits<{
  'update:pluginOpen': [value: boolean]
  'update:knowledgeOpen': [value: boolean]
  selectPluginSource: [value: PluginSourceKey]
  selectPluginCategory: [value: string]
  togglePlugin: [value: number]
  toggleKnowledge: [value: number]
}>()

const closePluginModal = () => emit('update:pluginOpen', false)
const closeKnowledgeModal = () => emit('update:knowledgeOpen', false)
const pluginCatalogLoadingVisible = ref(false)
let pluginCatalogLoadingTimer: ReturnType<typeof window.setTimeout> | undefined

watch(
  () => props.pluginCatalogLoading,
  (loading) => {
    if (pluginCatalogLoadingTimer) {
      window.clearTimeout(pluginCatalogLoadingTimer)
      pluginCatalogLoadingTimer = undefined
    }
    if (!loading) {
      pluginCatalogLoadingVisible.value = false
      return
    }
    pluginCatalogLoadingTimer = window.setTimeout(() => {
      pluginCatalogLoadingVisible.value = true
    }, 120)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (pluginCatalogLoadingTimer) {
    window.clearTimeout(pluginCatalogLoadingTimer)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="side-modal">
      <div v-if="pluginOpen" class="plugin-modal-mask" @click.self="closePluginModal">
        <div
          class="plugin-modal side-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pluginModalTitle"
        >
          <aside class="plugin-modal__sidebar">
            <h2 id="pluginModalTitle">选择插件</h2>
            <Button type="primary" block>
              <template #icon><Plus :size="15" /></template>
              创建自定义插件
            </Button>

            <div class="plugin-modal__nav">
              <button
                class="plugin-modal__nav-item"
                :class="{ 'is-active': activePluginSourceKey === 'custom' }"
                type="button"
                @click="emit('selectPluginSource', 'custom')"
              >
                <User :size="15" />
                <span>自定义插件</span>
              </button>
            </div>

            <div class="plugin-modal__category-title">类别</div>
            <div class="plugin-modal__nav">
              <button
                v-for="category in pluginCategoryOptions"
                :key="category.key"
                class="plugin-modal__nav-item"
                :class="{
                  'is-active':
                    activePluginSourceKey === 'category' &&
                    activePluginCategoryKey === category.key,
                }"
                type="button"
                @click="emit('selectPluginCategory', category.key)"
              >
                <component :is="category.icon" :size="15" />
                <span>{{ category.name }}</span>
              </button>
            </div>
          </aside>

          <section class="plugin-modal__content">
            <div class="plugin-modal__header">
              <h3>{{ activePluginSourceName }}</h3>
              <button
                class="side-modal__close"
                type="button"
                aria-label="关闭"
                @click="closePluginModal"
              >
                <X :size="18" />
              </button>
            </div>

            <div class="plugin-modal__list" :aria-busy="pluginCatalogLoading">
              <div
                v-if="pluginCatalogLoading && pluginGroups.length === 0"
                class="plugin-modal__empty"
              >
                {{ pluginCatalogLoadingVisible ? '正在加载插件...' : '' }}
              </div>
              <div v-else-if="pluginGroups.length === 0" class="plugin-modal__empty">
                {{ pluginEmptyText }}
              </div>
              <template v-else>
                <section v-for="group in pluginGroups" :key="group.key" class="plugin-modal__group">
                  <h4>{{ group.title }}</h4>
                  <article
                    v-for="item in group.items"
                    :key="item.id"
                    class="plugin-modal__item"
                    :class="{ 'is-selected': selectedPluginIds.has(item.id) }"
                  >
                    <div class="plugin-modal__item-icon" :class="{ 'has-image': item.icon }">
                      <img v-if="item.icon" :src="item.icon" alt="" />
                      <Database v-else :size="18" />
                    </div>
                    <strong>{{ item.name }}</strong>
                    <Button
                      class="plugin-modal__add"
                      size="small"
                      :type="selectedPluginIds.has(item.id) ? 'default' : 'primary'"
                      @click="emit('togglePlugin', item.id)"
                    >
                      <template #icon>
                        <CircleCheck v-if="selectedPluginIds.has(item.id)" :size="14" />
                        <Plus v-else :size="14" />
                      </template>
                      {{ selectedPluginIds.has(item.id) ? '移除' : '添加' }}
                    </Button>
                  </article>
                </section>
              </template>
              <div
                v-if="pluginCatalogLoadingVisible && pluginGroups.length > 0"
                class="plugin-modal__loading"
              >
                更新中...
              </div>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="side-modal">
      <div v-if="knowledgeOpen" class="plugin-modal-mask" @click.self="closeKnowledgeModal">
        <div
          class="knowledge-modal side-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knowledgeModalTitle"
        >
          <div class="knowledge-modal__header">
            <h2 id="knowledgeModalTitle">选择引用知识库</h2>
            <button
              class="side-modal__close"
              type="button"
              aria-label="关闭"
              @click="closeKnowledgeModal"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="knowledge-modal__list">
            <div v-if="knowledgeCatalogLoading" class="knowledge-modal__empty">
              正在加载知识库...
            </div>
            <div v-else-if="knowledgeCatalog.length === 0" class="knowledge-modal__empty">
              {{ knowledgeEmptyText }}
            </div>
            <template v-else>
              <button
                v-for="item in knowledgeCatalog"
                :key="item.id"
                type="button"
                class="knowledge-modal__item"
                :class="{ 'is-selected': selectedKnowledgeIds.has(item.id) }"
                @click="emit('toggleKnowledge', item.id)"
              >
                <span class="knowledge-modal__item-icon" :class="{ 'has-image': item.icon }">
                  <img v-if="item.icon" :src="item.icon" alt="" />
                  <BookOpen v-else :size="17" />
                </span>
                <span class="knowledge-modal__item-main">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.description || '暂无描述' }}</span>
                </span>
                <CircleCheck
                  v-if="selectedKnowledgeIds.has(item.id)"
                  class="knowledge-modal__selected-icon"
                  :size="16"
                />
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.plugin-modal-mask,
.plugin-modal-mask *,
.plugin-modal-mask *::before,
.plugin-modal-mask *::after {
  box-sizing: border-box;
}

.plugin-modal-mask {
  --color-primary: var(--primary-color);
  --color-text: var(--font-color);
  --color-text-strong: var(--font-active-color);
  --color-text-muted: var(--font-light-color);
  --color-bg-panel: var(--white);
  --color-bg-sidebar: var(--light-bg);
  --color-bg-soft: var(--touch-bg);
  --color-border-light: var(--border-color);
  --color-scrim: rgba(17, 24, 39, 0.35);
  --shadow-floating: 0 2.4rem 6.4rem rgba(17, 24, 39, 0.18);
  --radius-md: 0.8rem;
  --radius-xl: 1.6rem;
  --space-1: 0.4rem;
  --space-2: 0.8rem;
  --space-3: 1.2rem;
  --space-4: 1.6rem;
  --space-5: 2rem;
  --space-6: 2.4rem;
}

.side-modal-enter-active,
.side-modal-leave-active {
  transition: opacity 0.2s ease;
}

.side-modal-enter-active .side-modal-panel,
.side-modal-leave-active .side-modal-panel {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.side-modal-enter-from,
.side-modal-leave-to {
  opacity: 0;
}

.side-modal-enter-from .side-modal-panel,
.side-modal-leave-to .side-modal-panel {
  opacity: 0;
  transform: translateX(1.6rem);
}

.side-modal__close {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  place-items: center;
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.side-modal__close:hover,
.side-modal__close:focus-visible {
  color: var(--color-primary);
  background: var(--color-bg-soft);
  outline: 0;
}

.plugin-modal-mask {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  padding: 2rem 2.2rem 2rem 0;
  background: var(--color-scrim);
}

.plugin-modal {
  display: grid;
  grid-template-columns: 20rem 44.8rem;
  width: 64.8rem;
  max-width: calc(100vw - 4.8rem);
  height: calc(100dvh - 4rem);
  overflow: hidden;
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-floating);
}

.plugin-modal__sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-3);
  background: var(--color-bg-sidebar);
}

.plugin-modal__sidebar h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.plugin-modal__nav {
  display: grid;
  gap: var(--space-1);
}

.plugin-modal__nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 3.2rem;
  padding: 0 var(--space-3);
  color: var(--color-text);
  font: inherit;
  font-size: 1.4rem;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.plugin-modal__nav-item:hover,
.plugin-modal__nav-item:focus-visible,
.plugin-modal__nav-item.is-active {
  color: var(--color-primary);
  background: var(--color-bg-panel);
  outline: 0;
}

.plugin-modal__category-title {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.6rem;
}

.plugin-modal__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-4) var(--space-4) var(--space-5);
}

.plugin-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.plugin-modal__header h3 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.plugin-modal__list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.plugin-modal__empty {
  padding: var(--space-6) 0;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  text-align: center;
}

.plugin-modal__loading {
  position: sticky;
  top: 0;
  z-index: 1;
  width: fit-content;
  margin-left: auto;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.6rem;
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 0.4rem 1.2rem rgba(17, 24, 39, 0.08);
  pointer-events: none;
}

.plugin-modal__group {
  display: grid;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.plugin-modal__group h4 {
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.6rem;
}

.plugin-modal__item {
  display: grid;
  grid-template-columns: 2.8rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 3.2rem;
  padding: 0 var(--space-2);
  border: 0.1rem solid transparent;
  border-radius: var(--radius-md);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.plugin-modal__item:hover,
.plugin-modal__item:focus-within {
  background: var(--color-bg-soft);
  border-color: var(--color-border-light);
}

.plugin-modal__add {
  opacity: 0;
  transition: opacity 0.16s ease;
}

.plugin-modal__item:hover .plugin-modal__add,
.plugin-modal__item:focus-within .plugin-modal__add,
.plugin-modal__item.is-selected .plugin-modal__add,
.plugin-modal__add:disabled {
  opacity: 1;
}

.plugin-modal__item-icon {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  overflow: hidden;
  color: var(--color-text);
  border-radius: 50%;
}

.plugin-modal__item-icon.has-image {
  background: var(--color-bg-panel);
}

.plugin-modal__item-icon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plugin-modal__item strong {
  display: block;
  overflow: hidden;
  color: var(--color-text);
  font-size: 1.3rem;
  font-weight: 400;
  line-height: 1.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-modal {
  display: flex;
  flex-direction: column;
  width: 36rem;
  max-width: calc(100vw - 4.8rem);
  height: calc(100dvh - 4rem);
  overflow: hidden;
  background: var(--color-bg-panel);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-floating);
}

.knowledge-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 5.6rem;
  padding: 0 var(--space-4);
  border-bottom: 0.1rem solid var(--color-border-light);
}

.knowledge-modal__header h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.knowledge-modal__list {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
}

.knowledge-modal__empty {
  padding: var(--space-6) 0;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  text-align: center;
}

.knowledge-modal__item {
  display: grid;
  grid-template-columns: 3.6rem minmax(0, 1fr) 2rem;
  align-items: center;
  gap: var(--space-3);
  min-height: 5.2rem;
  padding: var(--space-2);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0.1rem solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.knowledge-modal__item:hover,
.knowledge-modal__item:focus-visible,
.knowledge-modal__item.is-selected {
  background: var(--color-bg-soft);
  border-color: var(--color-border-light);
  outline: 0;
}

.knowledge-modal__item-icon {
  display: grid;
  width: 3.6rem;
  height: 3.6rem;
  place-items: center;
  overflow: hidden;
  color: var(--color-primary);
  background: var(--color-bg-sidebar);
  border-radius: var(--radius-md);
}

.knowledge-modal__item-icon.has-image {
  background: var(--color-bg-panel);
}

.knowledge-modal__item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.knowledge-modal__item-main {
  display: grid;
  min-width: 0;
}

.knowledge-modal__item-main strong,
.knowledge-modal__item-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-modal__item-main strong {
  color: var(--color-text-strong);
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
}

.knowledge-modal__item-main span {
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.knowledge-modal__selected-icon {
  color: var(--color-primary);
}
</style>
