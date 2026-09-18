<script setup lang="ts">
import { PlusOutlined, SearchOutlined } from '@antdv-next/icons'
import { Button, Input } from 'antdv-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { ListPageProps, ListPageTab } from './types'

const props = withDefaults(defineProps<ListPageProps>(), {
  tabs: () => [],
  searchPlaceholder: '搜索',
  showSearch: true,
  searchProps: () => ({}),
})

const emit = defineEmits<{
  create: []
}>()

const activeTab = defineModel<string>('activeTab')
const searchValue = defineModel<string>('searchValue')
const route = useRoute()
const pageTitle = computed(() => props.title ?? route.meta.title)
const pageIcon = computed(() => props.icon ?? route.meta.icon)
const routeTabs = computed(() =>
  props.tabs.filter((tab): tab is ListPageTab & { to: NonNullable<ListPageTab['to']> } =>
    Boolean(tab.to),
  ),
)
const actionTabs = computed(() => props.tabs.filter((tab) => !tab.to))
const mergedSearchProps = computed(() => ({
  placeholder: props.searchPlaceholder,
  ...props.searchProps,
}))
</script>

<template>
  <div class="ListPage">
    <div class="header">
      <div class="logo_btn">
        <div class="logo">
          <div class="img">
            <component :is="pageIcon" v-if="pageIcon" />
          </div>
          <div class="heading">
            <div class="title">{{ pageTitle }}</div>
            <div v-if="props.description" class="description">{{ props.description }}</div>
          </div>
        </div>
        <div class="btn" v-if="props.createText">
          <Button type="primary" class="create-btn" size="large" @click="emit('create')">
            <template #icon>
              <PlusOutlined />
            </template>
            {{ props.createText }}
          </Button>
        </div>
      </div>
      <div class="tab_search">
        <div class="tabs" v-if="props.tabs.length">
          <router-link
            v-for="tab in routeTabs"
            :key="tab.key"
            :to="tab.to"
            active-class="active"
            :class="{ active: activeTab === tab.key }"
          >
            {{ tab.title }}
          </router-link>
          <button
            v-for="tab in actionTabs"
            :key="tab.key"
            type="button"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.title }}
          </button>
        </div>
        <div class="search" v-if="props.showSearch">
          <Input v-model:value="searchValue" v-bind="mergedSearchProps">
            <template #prefix>
              <SearchOutlined />
            </template>
          </Input>
        </div>
      </div>
    </div>
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ListPage {
  padding: 2.4rem;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  .header {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2.4rem;
    margin-bottom: 2.4rem;
    .logo_btn {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 4rem;
      justify-content: space-between;
      .logo {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        .img {
          width: 3.2rem;
          height: 3.2rem;
          background-color: var(--primary-color);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          svg {
            fill: white;
            color: white;
            width: 60%;
          }
        }
        .title {
          font-size: 2rem;
          font-weight: 500;
        }
        .heading {
          display: flex;
          min-width: 0;
          align-items: baseline;
          gap: 1.2rem;
        }
        .description {
          color: var(--font-light-color);
          font-size: 1.3rem;
          line-height: 2rem;
        }
      }
    }
    .tab_search {
      display: flex;
      align-items: center;
      justify-content: space-between;
      .tabs {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        a,
        button {
          line-height: 3.2rem;
          height: 3.2rem;
          padding: 0 1.4rem;
          font-size: 1.4rem;
          color: var(--text-color);
          border-radius: 0.8rem;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-family: inherit;
        }
        .active {
          background-color: var(--border-color);
        }
      }
    }
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
}
</style>
