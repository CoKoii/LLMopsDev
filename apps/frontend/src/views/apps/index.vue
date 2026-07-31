<script setup lang="ts">
import { listAiAppCategoriesApi, listAiAppsApi, type AiAppItem } from '@/api'
import ListBox from '@/components/ListBox/ListBox.vue'
import type { ListBoxItem } from '@/components/ListBox/types'
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListPageTab } from '@/components/ListPage/types'
import { message } from 'antdv-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const allAppCategoryKey = '__all__'
const activeTab = ref(allAppCategoryKey)
const searchValue = ref('')
const tabs = ref<ListPageTab[]>([])
const apps = ref<AiAppItem[]>([])
const loading = ref(false)
const router = useRouter()
let appRequestId = 0

const listItems = computed<ListBoxItem[]>(() =>
  apps.value.map((app) => ({
    id: app.id,
    title: app.name,
    description: formatAppDescription(app),
    content: app.description || '暂无描述',
    image: app.image || undefined,
    footer: app.updatedAt ? `最近更新 ${formatDate(app.updatedAt)}` : undefined,
    raw: app,
  })),
)

function formatAppDescription(app: AiAppItem) {
  const categoryName = app.category?.name || '未分类'
  const modelName = app.model?.modelName
  return modelName ? `${categoryName} · ${modelName}` : categoryName
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadApps() {
  const requestId = ++appRequestId
  loading.value = true
  try {
    const result = await listAiAppsApi({
      page: 1,
      pageSize: 200,
      name: searchValue.value,
      scope: 'available',
      ...(activeTab.value === allAppCategoryKey ? {} : { categoryKey: activeTab.value }),
    })
    if (requestId === appRequestId) {
      apps.value = result.items
    }
  } catch {
    if (requestId === appRequestId) {
      apps.value = []
    }
    message.error('应用列表获取失败')
  } finally {
    if (requestId === appRequestId) {
      loading.value = false
    }
  }
}

async function loadCategories() {
  tabs.value = [{ key: allAppCategoryKey, title: '全部' }]
  try {
    const categories = await listAiAppCategoriesApi()
    tabs.value = [
      { key: allAppCategoryKey, title: '全部' },
      ...categories.map((category) => ({
        key: category.key,
        title: category.name,
      })),
    ]
  } catch {
    message.error('应用分类获取失败')
  }
}

function openApp(item: ListBoxItem) {
  const app = item.raw as AiAppItem
  void router.push({ name: 'standalone-app-chat', params: { appId: app.id } })
}

onMounted(() => {
  void loadCategories()
})

watch(
  activeTab,
  () => {
    apps.value = []
    void loadApps()
  },
  { immediate: true },
)

watch(searchValue, () => {
  void loadApps()
})
</script>

<template>
  <ListPage v-model:active-tab="activeTab" v-model:search-value="searchValue" :tabs="tabs">
    <Transition name="app-market-tab" mode="out-in">
      <div :key="activeTab" class="app-market-tab-panel">
        <ListBox :items="listItems" :loading="loading" :actions="false" @open="openApp" />
      </div>
    </Transition>
  </ListPage>
</template>

<style scoped lang="scss">
.app-market-tab-panel {
  min-height: 100%;
}

.app-market-tab-enter-active,
.app-market-tab-leave-active {
  transition: opacity 0.16s ease;
}

.app-market-tab-enter-from {
  opacity: 0;
}

.app-market-tab-leave-to {
  opacity: 0;
}
</style>
