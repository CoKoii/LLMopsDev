<script lang="ts" setup>
import SideBar from '@/components/SideBar/SideBar.vue'
import { Layout, LayoutContent, LayoutSider } from 'antdv-next'
import type { CSSProperties } from 'vue'

const contentStyle: CSSProperties = {
  textAlign: 'center',
  lineHeight: '100vh',
  color: '#fff',
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
      <LayoutContent :style="contentStyle">Content</LayoutContent>
    </Layout>
  </Layout>
</template>
