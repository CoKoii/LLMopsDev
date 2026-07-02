<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="index" style="color: red">{{ route.name }}</div>
</template>

<style scoped lang="scss"></style>
