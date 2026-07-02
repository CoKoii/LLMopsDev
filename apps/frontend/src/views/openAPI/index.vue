<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <ListPage>
    <div class="index" style="color: red">{{ route.name }}</div>
  </ListPage>
</template>

<style scoped lang="scss"></style>
