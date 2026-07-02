<script setup lang="ts">
import { PlusOutlined, SearchOutlined } from '@antdv-next/icons'
import { Button, Input } from 'antdv-next'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { ListPageTab } from './types'

const props = withDefaults(
  defineProps<{
    title?: string
    icon?: Component
    createText?: string
    tabs?: ListPageTab[]
  }>(),
  {
    createText: '创建AI应用',
    tabs: () => [],
  },
)

const route = useRoute()
const pageTitle = computed(() => props.title ?? route.meta.title)
const pageIcon = computed(() => props.icon ?? route.meta.icon)
</script>

<template>
  <div class="ListPage">
    <div class="header">
      <div class="logo_btn">
        <div class="logo">
          <div class="img">
            <component :is="pageIcon" v-if="pageIcon" />
          </div>
          <div class="title">{{ pageTitle }}</div>
        </div>
        <div class="btn">
          <Button type="primary" class="create-btn" size="large">
            <template #icon>
              <PlusOutlined />
            </template>
            {{ props.createText }}
          </Button>
        </div>
      </div>
      <div class="tab_search">
        <div class="tabs">
          <router-link
            v-for="tab in props.tabs"
            :key="tab.title"
            :to="tab.to"
            active-class="active"
          >
            {{ tab.title }}
          </router-link>
        </div>
        <div class="search">
          <Input placeholder="搜索">
            <template #prefix>
              <SearchOutlined />
            </template>
          </Input>
        </div>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ListPage {
  padding: 2.4rem;
  height: 100%;
  .header {
    display: flex;
    flex-direction: column;
    gap: 2.4rem;
    .logo_btn {
      display: flex;
      align-items: center;
      width: 100%;
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
        a {
          line-height: 3.2rem;
          height: 3.2rem;
          padding: 0 1.4rem;
          font-size: 1.4rem;
          color: var(--text-color);
          border-radius: 0.8rem;
        }
        .active {
          background-color: var(--border-color);
        }
      }
    }
  }
}
</style>
