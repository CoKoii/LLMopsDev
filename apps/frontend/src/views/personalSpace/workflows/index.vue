<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import ListPage from '@/components/ListPage/ListPage.vue'
import { personalSpaceListPage } from '../listPage'
</script>

<template>
  <ListPage v-bind="personalSpaceListPage" create-text="创建工作流">
    <ListBox />
  </ListPage>
</template>

<style scoped lang="scss"></style>
