<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const createRequest = ref(0)
const isKeysPage = computed(() => route.name === 'open-api-keys')
const tabs: ListPageTab[] = [
  { key: 'quick-start', title: '快速开始', to: { name: 'open-api-quick-start' } },
  { key: 'keys', title: '密钥', to: { name: 'open-api-keys' } },
]
</script>

<template>
  <ListPage
    title="开放API"
    description="利用开放 API 快速与企业现有业务对接"
    :tabs="tabs"
    :show-search="false"
    :create-text="isKeysPage ? '新增密钥' : undefined"
    @create="createRequest += 1"
  >
    <RouterView v-slot="{ Component }">
      <component :is="Component" v-bind="isKeysPage ? { createRequest } : {}" />
    </RouterView>
  </ListPage>
</template>
