<script setup lang="ts">
import PageToolbar from '@/components/PageToolbar/PageToolbar.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <PageToolbar>
    <div class="index" style="color: red">{{ route.name }}</div>
  </PageToolbar>
</template>

<style scoped lang="scss"></style>
