<script lang="ts" setup>
import SideBar from '@/components/SideBar/SideBar.vue'
import { Layout, LayoutContent, LayoutSider } from 'antdv-next'
import type { CSSProperties } from 'vue'
import { RouterView } from 'vue-router'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

const contentStyle: CSSProperties = {
  height: '100vh',
  minHeight: 0,
  overflow: 'hidden',
}

const siderStyle: CSSProperties = {
  height: '100vh',
}

function getPageTransition(route: RouteLocationNormalizedLoaded) {
  return typeof route.meta.pageTransition === 'string' ? route.meta.pageTransition : 'workspace-fade'
}

function getShellKey(route: RouteLocationNormalizedLoaded) {
  return typeof route.meta.shellKey === 'string' ? route.meta.shellKey : String(route.name)
}
</script>

<template>
  <Layout>
    <LayoutSider width="24rem" :style="siderStyle">
      <SideBar />
    </LayoutSider>
    <Layout>
      <LayoutContent :style="contentStyle">
        <RouterView v-slot="{ Component, route }">
          <Transition
            :name="getPageTransition(route)"
            mode="out-in"
            appear
          >
            <component :is="Component" :key="getShellKey(route)" />
          </Transition>
        </RouterView>
      </LayoutContent>
    </Layout>
  </Layout>
</template>

<style scoped lang="scss">
.workspace-fade-enter-active,
.workspace-fade-leave-active,
.workspace-slide-enter-active,
.workspace-slide-leave-active,
.workspace-rise-enter-active,
.workspace-rise-leave-active {
  transition: opacity 0.22s ease;
}

.workspace-slide-enter-active,
.workspace-slide-leave-active,
.workspace-rise-enter-active,
.workspace-rise-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.workspace-fade-enter-from,
.workspace-fade-leave-to,
.workspace-slide-enter-from,
.workspace-slide-leave-to,
.workspace-rise-enter-from,
.workspace-rise-leave-to {
  opacity: 0;
}

.workspace-slide-enter-from {
  transform: translateX(1.2rem);
}

.workspace-slide-leave-to {
  transform: translateX(-0.8rem);
}

.workspace-rise-enter-from {
  transform: translateY(0.8rem);
}

.workspace-rise-leave-to {
  transform: translateY(-0.4rem);
}
</style>
