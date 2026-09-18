<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const createRequest = ref(0)
const isKeysPage = computed(() => route.name === 'open-api-keys')
const tabs: ListPageTab[] = [
  { key: 'quick-start', title: '快速开始', to: { name: 'open-api-quick-start' } },
  { key: 'keys', title: '密钥', to: { name: 'open-api-keys' } },
]
</script>

<template>
  <ListPage
    title="开放API"
    description="利用开放 API 快速与企业现有业务对接"
    :tabs="tabs"
    :show-search="false"
    :create-text="isKeysPage ? '新增密钥' : undefined"
    @create="createRequest += 1"
  >
    <RouterView v-slot="{ Component, route: tabRoute }">
      <Transition name="open-api-tab" mode="out-in">
        <div :key="tabRoute.name" class="open-api-tab-panel">
          <component :is="Component" v-bind="isKeysPage ? { createRequest } : {}" />
        </div>
      </Transition>
    </RouterView>
  </ListPage>
</template>

<style scoped lang="scss">
.open-api-tab-panel {
  min-height: 100%;
}

.open-api-tab-enter-active,
.open-api-tab-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.open-api-tab-enter-from {
  opacity: 0;
  transform: translateY(0.6rem);
}

.open-api-tab-leave-to {
  opacity: 0;
  transform: translateY(-0.3rem);
}
</style>
