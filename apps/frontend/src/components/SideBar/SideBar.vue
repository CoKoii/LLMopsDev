<script setup lang="ts">
import { PlusOutlined } from '@antdv-next/icons'
import { Button } from 'antdv-next'
</script>

<template>
  <div class="SideBar">
    <div class="content">
      <div class="title"></div>
      <Button type="primary" block>
        <template #icon>
          <PlusOutlined />
        </template>
        创建AI应用
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.SideBar {
  width: 100%;
  height: 100%;
  padding: 0.8rem;
  .content {
    width: 100%;
    height: 100%;
    padding: 1.6rem 0.8rem;
    border-radius: 0.8rem;
    background-color: var(--white);
    .title {
      width: 11rem;
      height: 3.6rem;
      border-radius: 0.8rem;
      background: rgb(229, 231, 235);
      margin-bottom: 2rem;
    }
  }
}
</style>
