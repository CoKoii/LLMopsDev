<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'
import { ref } from 'vue'

const activeTab = ref('all')
const tabs: ListPageTab[] = [
  { key: 'all', title: '全部' },
  { key: 'tools', title: '工具' },
  { key: 'data', title: '数据' },
]
</script>

<template>
  <ListPage v-model:active-tab="activeTab" :tabs="tabs">
    <ListBox />
  </ListPage>
</template>

<style scoped lang="scss"></style>
