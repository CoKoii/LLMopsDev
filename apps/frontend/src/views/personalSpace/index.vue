<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { personalSpaceListPage } from './listPage'

const route = useRoute()

const createTextMap: Record<string, string> = {
  'personal-space-apps': '创建AI应用',
  'personal-space-plugins': '创建插件',
  'personal-space-workflows': '创建工作流',
  'personal-space-knowledge': '创建知识库',
}

const createText = computed(() => createTextMap[String(route.name)] ?? '创建')
</script>

<template>
  <ListPage v-bind="personalSpaceListPage" :create-text="createText">
    <RouterView />
  </ListPage>
</template>
