<script setup lang="ts">
import { ConfigProvider } from 'antdv-next'
import { RouterView } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { createAntdTheme } from '@/styles/theme'

const antdTheme = createAntdTheme()

function getAppTransition(route: RouteLocationNormalizedLoaded) {
  return typeof route.meta.appTransition === 'string' ? route.meta.appTransition : 'app-shell'
}
</script>

<template>
  <ConfigProvider :theme="antdTheme">
    <RouterView v-slot="{ Component, route }">
      <Transition :name="getAppTransition(route)" mode="out-in">
        <component :is="Component" :key="route.matched[0]?.path ?? route.fullPath" />
      </Transition>
    </RouterView>
  </ConfigProvider>
</template>

<style scoped lang="scss">
.app-shell-enter-active,
.app-shell-leave-active,
.page-forward-enter-active,
.page-forward-leave-active {
  transition: opacity 0.22s ease;
}

.page-forward-enter-active,
.page-forward-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.app-shell-enter-from,
.app-shell-leave-to,
.page-forward-enter-from,
.page-forward-leave-to {
  opacity: 0;
}

.page-forward-enter-from {
  transform: translateY(0.8rem);
}

.page-forward-leave-to {
  transform: translateY(-0.4rem);
}
</style>
