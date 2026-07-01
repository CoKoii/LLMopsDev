<script setup lang="ts">
import { routes } from '@/router/menus'
import { PlusOutlined } from '@antdv-next/icons'
import { Button } from 'antdv-next'
import { useRoute } from 'vue-router'
const route = useRoute()
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
      <div class="menus">
        <div class="menu-item" v-for="(item, index) in routes" :key="index">
          <div class="tag" v-if="item.tag">{{ item.tag }}</div>
          <router-link :to="item.path" class="link" :class="{ active: item.path === route.path }">
            <component :is="item.icon" v-if="item.icon" class="icon" />
            <span class="text">{{ item.name }}</span>
          </router-link>
        </div>
      </div>
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
    .menus {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      margin-top: 1.6rem;
      .menu-item {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        .tag {
          padding: 0 0.6rem;
          color: var(--font-light-color);
        }
        .link {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          width: 100%;
          box-sizing: border-box;
          padding: 0 0.8rem;
          font-size: 1.4rem;
          line-height: 1;
          border-radius: 8px;
          height: 3.2rem;
          color: var(--font-color);
          text-decoration: none;
          &:hover {
            background-color: var(--touch-bg);
          }
        }
        .link.active {
          background-color: var(--touch-bg);
          color: var(--font-active-color);
        }
        .link :deep(.icon) {
          width: 1.4rem;
          height: 1.4rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .link :deep(.icon svg) {
          width: 100%;
          height: 100%;
          display: block;
        }
        .link .text {
          line-height: 1;
        }
      }
    }
  }
}
</style>
