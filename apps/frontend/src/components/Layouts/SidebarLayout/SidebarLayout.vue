<script lang="ts" setup>
import SideBar from '@/components/SideBar/SideBar.vue'
import { Layout, LayoutContent, LayoutSider } from 'antdv-next'
import type { CSSProperties } from 'vue'

const contentStyle: CSSProperties = {
  height: '100vh',
}

const siderStyle: CSSProperties = {
  height: '100vh',
}
</script>

<template>
  <Layout>
    <LayoutSider width="24rem" :style="siderStyle">
      <SideBar />
    </LayoutSider>
    <Layout>
      <LayoutContent :style="contentStyle">
        <RouterView />
      </LayoutContent>
    </Layout>
  </Layout>
</template>
