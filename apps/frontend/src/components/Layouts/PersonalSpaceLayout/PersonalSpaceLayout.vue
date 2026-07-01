<script lang="ts" setup>
import { Layout, LayoutContent, LayoutHeader, LayoutSider } from 'antdv-next'
import type { CSSProperties } from 'vue'
const headerStyle: CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  height: 64,
  paddingInline: 50,
  lineHeight: '64px',
}

const contentStyle: CSSProperties = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  color: '#fff',
}

const siderStyle: CSSProperties = {
  textAlign: 'center',
  height: '100vh',
  color: '#fff',
}
</script>
<template>
  <Layout>
    <LayoutSider width="240px" :style="siderStyle">Sider</LayoutSider>
    <Layout>
      <LayoutHeader :style="headerStyle">Header</LayoutHeader>
      <LayoutContent :style="contentStyle">Content</LayoutContent>
    </Layout>
  </Layout>
</template>
