<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'
import { ref } from 'vue'

const activeTab = ref('quick-start')
const tabs: ListPageTab[] = [
  { key: 'quick-start', title: '快速开始' },
  { key: 'keys', title: '秘钥' },
]
</script>

<template>
  <ListPage v-model:active-tab="activeTab" :tabs="tabs" :show-search="false">
    <div class="index" style="color: red">{{ activeTab }}</div>
  </ListPage>
</template>

<style scoped lang="scss"></style>
