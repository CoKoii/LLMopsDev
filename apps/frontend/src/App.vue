<script setup lang="ts">
import { ConfigProvider } from 'antdv-next'

import { createAntdTheme } from '@/styles/theme'

const antdTheme = createAntdTheme()
</script>

<template>
  <ConfigProvider :theme="antdTheme">
    <RouterView />
  </ConfigProvider>
</template>

<style scoped lang="scss"></style>
