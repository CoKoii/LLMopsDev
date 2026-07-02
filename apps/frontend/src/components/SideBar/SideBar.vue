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
      <div class="main">
        <div class="title">
          <img src="@/assets/images/logo.png" alt="Logo" class="logo" />
          <span class="text">苏应LLMOps</span>
        </div>
        <Button type="primary" block class="create-btn">
          <template #icon>
            <PlusOutlined />
          </template>
          创建AI应用
        </Button>
        <div class="menus">
          <div class="menu-item" v-for="(item, index) in routes[0]?.children" :key="index">
            <div class="tag" v-if="item.meta?.tag">{{ item.meta.tag }}</div>
            <router-link :to="item.path" class="link" :class="{ active: item.path === route.path }">
              <component :is="item.meta?.icon" v-if="item.meta?.icon" class="icon" />
              <span class="text">{{ item.meta?.title }}</span>
            </router-link>
          </div>
        </div>
      </div>
      <div class="user">
        <div class="avatar">
          <img src="http://q1.qlogo.cn/g?b=qq&nk=2655257336&s=100" alt="Avatar" />
        </div>
        <div class="info">
          <div class="name">CaoKai</div>
          <div class="email">2655257336@qq.com</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './SideBar.scss';
</style>
