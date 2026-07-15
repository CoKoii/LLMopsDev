<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { personalSpaceListPage } from './listPage'

const route = useRoute()
const searchValue = ref('')
const createKey = ref(0)

const createTextMap: Record<string, string> = {
  'personal-space-apps': '创建AI应用',
  'personal-space-plugins': '创建插件',
  'personal-space-workflows': '创建工作流',
  'personal-space-knowledge': '创建知识库',
}

const createText = computed(() => createTextMap[String(route.name)] ?? '创建')

watch(
  () => route.name,
  () => {
    searchValue.value = ''
  },
)
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
          <component :is="Component" :search-value="searchValue" :create-key="createKey" />
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
