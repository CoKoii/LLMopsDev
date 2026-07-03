<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'

const tabs: ListPageTab[] = [
  { key: 'quick-start', title: '快速开始', to: { name: 'open-api-quick-start' } },
  { key: 'keys', title: '秘钥', to: { name: 'open-api-keys' } },
]
</script>

<template>
  <ListPage :tabs="tabs" :show-search="false">
    <RouterView />
  </ListPage>
</template>
