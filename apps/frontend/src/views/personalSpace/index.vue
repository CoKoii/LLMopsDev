<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import { useAuthStore } from '@/stores/auth'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { personalSpaceListPage } from './listPage'

interface CurrentUserInfo {
  username?: string
  profile?: {
    nickname?: string | null
    avatar?: string | null
  }
}

const route = useRoute()
const authStore = useAuthStore()
const searchValue = ref('')
const createKey = ref(0)

const createTextMap: Record<string, string> = {
  'personal-space-apps': '创建AI应用',
  'personal-space-plugins': '创建插件',
  'personal-space-workflows': '创建工作流',
  'personal-space-knowledge': '创建知识库',
}

const createText = computed(() => createTextMap[String(route.name)] ?? '创建')
const creatorAvatar = computed(
  () => (authStore.userInfo as CurrentUserInfo | undefined)?.profile?.avatar || '',
)
const creatorName = computed(() => {
  const userInfo = authStore.userInfo as CurrentUserInfo | undefined
  return userInfo?.profile?.nickname || userInfo?.username || '用户'
})
const childRouteProps = computed(() => ({
  searchValue: searchValue.value,
  createKey: createKey.value,
  creatorAvatar: creatorAvatar.value,
  ...(route.name === 'personal-space-plugins' ? { creatorName: creatorName.value } : {}),
}))

watch(
  () => route.name,
  () => {
    searchValue.value = ''
  },
)

onMounted(() => {
  void authStore.getUserInfo()
})
</script>

<template>
  <ListPage
    v-bind="personalSpaceListPage"
    v-model:search-value="searchValue"
    :create-text="createText"
    @create="createKey += 1"
  >
    <RouterView v-slot="{ Component }">
      <Transition name="personal-space-tab" mode="out-in">
        <div :key="route.name" class="personal-space-tab-panel">
          <component :is="Component" v-bind="childRouteProps" />
        </div>
      </Transition>
    </RouterView>
  </ListPage>
</template>

<style scoped lang="scss">
.personal-space-tab-panel {
  min-height: 100%;
}

.personal-space-tab-enter-active,
.personal-space-tab-leave-active {
  transition: opacity 0.16s ease;
}

.personal-space-tab-enter-from {
  opacity: 0;
}

.personal-space-tab-leave-to {
  opacity: 0;
}
</style>
