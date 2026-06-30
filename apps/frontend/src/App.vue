<script lang="ts" setup>
import { Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutSider } from 'ant-design-vue'
import type { CSSProperties } from 'vue'
const headerStyle: CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  height: 64,
  paddingInline: 50,
  lineHeight: '64px',
  backgroundColor: '#7dbcea',
}

const contentStyle: CSSProperties = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  color: '#fff',
  backgroundColor: '#108ee9',
}

const siderStyle: CSSProperties = {
  textAlign: 'center',
  height: '100vh',
  color: '#fff',
  backgroundColor: '#3ba0e9',
}
const footerStyle: CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  backgroundColor: '#7dbcea',
}
</script>
<template>
  <Layout>
    <LayoutSider width="15rem" :style="siderStyle">Sider</LayoutSider>

    <Layout>
      <LayoutHeader :style="headerStyle">Header</LayoutHeader>
      <LayoutContent :style="contentStyle">Content</LayoutContent>
      <LayoutFooter :style="footerStyle">Footer</LayoutFooter>
    </Layout>
  </Layout>
</template>
