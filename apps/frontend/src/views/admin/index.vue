<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const tabs = [
  { key: 'admin-models', title: '模型配置', permission: 'llm:list' },
  { key: 'admin-users', title: '用户管理', permission: 'user:list' },
  { key: 'admin-roles', title: '角色管理', permission: 'role:list' },
  { key: 'admin-permissions', title: '权限管理', permission: 'permission:list' },
]
const activeKey = computed(() => String(route.name || 'admin-models'))
</script>

<template>
  <div class="admin-shell">
    <header class="admin-header">
      <div class="admin-title-row">
        <div class="admin-icon"><ShieldCheck :size="20" /></div>
        <div>
          <h1>后台管理</h1>
          <p>维护平台运行所需的模型、账号与访问控制</p>
        </div>
      </div>
      <nav class="admin-tabs" aria-label="后台管理导航">
        <router-link
          v-for="tab in tabs"
          :key="tab.key"
          v-show="
            (route.meta as { availablePermissions?: string[] }).availablePermissions?.includes(
              tab.permission,
            ) ?? true
          "
          :to="{ name: tab.key }"
          :class="{ active: activeKey === tab.key }"
        >
          {{ tab.title }}
        </router-link>
      </nav>
    </header>
    <main class="admin-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped lang="scss">
.admin-shell {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 2.8rem 3.2rem;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  background: var(--light-bg);
}

.admin-header {
  flex: none;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2.4rem;
  border-bottom: 0.1rem solid var(--border-color);
}

.admin-title-row {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding-bottom: 2rem;
}

.admin-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 0.8rem;
  display: grid;
  place-items: center;
  color: var(--white);
  background: var(--primary-color);
}

h1 {
  margin: 0;
  color: var(--font-active-color);
  font-size: 2.2rem;
  line-height: 3rem;
}

p {
  margin: 0.4rem 0 0;
  color: var(--font-light-color);
  font-size: 1.3rem;
}

.admin-tabs {
  display: flex;
  gap: 0.4rem;
}

.admin-tabs a {
  padding: 1.2rem 1.6rem;
  color: var(--font-light-color);
  font-size: 1.4rem;
  text-decoration: none;
  border-bottom: 0.2rem solid transparent;
}

.admin-tabs a:hover,
.admin-tabs a.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.admin-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

@media (max-width: 920px) {
  .admin-header {
    align-items: stretch;
    flex-direction: column;
    gap: 0;
  }

  .admin-tabs {
    overflow-x: auto;
  }

  .admin-tabs a {
    white-space: nowrap;
  }
}
</style>
