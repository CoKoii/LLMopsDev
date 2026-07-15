<script setup lang="ts">
import { mainRoutes } from '@/router/menus'
import { useAuthStore } from '@/stores/auth'
import { LogoutOutlined, PlusOutlined, SettingOutlined } from '@antdv-next/icons'
import { Button, Dropdown, message } from 'antdv-next'
import type { MenuProps } from 'antdv-next'
import type { RouteRecordNameGeneric, RouteRecordRaw } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()
const authStore = useAuthStore()

const userMenuItems: MenuProps['items'] = [
  {
    key: 'account-settings',
    icon: SettingOutlined,
    label: '账号设置',
  },
  {
    key: 'divider',
    type: 'divider',
  },
  {
    key: 'logout',
    icon: LogoutOutlined,
    label: '退出登录',
    danger: true,
  },
]

function getMenuName(item: RouteRecordRaw): RouteRecordNameGeneric | undefined {
  const activeMenu = item.meta?.activeMenu
  return typeof activeMenu === 'string' ? activeMenu : item.name
}

function isMenuActive(item: RouteRecordRaw) {
  const menuName = getMenuName(item)

  if (!menuName) return false

  return route.matched.some(
    (record) => record.name === menuName || record.meta.activeMenu === menuName,
  )
}

async function handleUserMenuClick({ key }: { key: string | number }) {
  if (key === 'account-settings') {
    message.info('账号设置功能开发中')
    return
  }

  if (key === 'logout') {
    await authStore.authLogout()
  }
}
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
          <div class="menu-item" v-for="item in mainRoutes" :key="item.path">
            <div class="tag" v-if="item.meta?.tag">{{ item.meta.tag }}</div>
            <router-link
              :to="{ name: getMenuName(item) }"
              class="link"
              :class="{ active: isMenuActive(item) }"
            >
              <component :is="item.meta?.icon" v-if="item.meta?.icon" class="icon" />
              <span class="text">{{ item.meta?.title }}</span>
            </router-link>
          </div>
        </div>
      </div>
      <Dropdown
        :menu="{ items: userMenuItems }"
        :trigger="['hover']"
        :mouse-enter-delay="0"
        :mouse-leave-delay="0.12"
        placement="topRight"
        @menu-click="handleUserMenuClick"
      >
        <div class="user">
          <div class="avatar">
            <img src="http://q1.qlogo.cn/g?b=qq&nk=2655257336&s=100" alt="Avatar" />
          </div>
          <div class="info">
            <div class="name">CaoKai</div>
            <div class="email">2655257336@qq.com</div>
          </div>
        </div>
      </Dropdown>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './SideBar.scss';
</style>
