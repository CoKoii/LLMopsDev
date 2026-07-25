<script setup lang="ts">
import ListBox from '@/components/ListBox/ListBox.vue'
import ListPage from '@/components/ListPage/ListPage.vue'
import type { ListBoxItem } from '@/components/ListBox/types'
import type { ListPageTab } from '@/components/ListPage/types'
import PluginDetailDrawer from '@/components/PluginDetailDrawer.vue'
import { getPluginApi, listPluginCategoriesApi, listPluginsApi, type PluginItem } from '@/api'
import { message } from 'antdv-next'
import { computed, onMounted, ref, watch } from 'vue'

const allPluginCategoryKey = '__all__'
const activeTab = ref(allPluginCategoryKey)
const searchValue = ref('')
const tabs = ref<ListPageTab[]>([])
const plugins = ref<PluginItem[]>([])
const loading = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailRecord = ref<PluginItem>()
let pluginRequestId = 0
const listItems = computed(() =>
  plugins.value.map((plugin) => ({
    id: plugin.id,
    title: plugin.name,
    description: plugin.category?.name || '已发布',
    content: plugin.description || plugin.openapiSchema,
    image: plugin.icon || undefined,
    footer: plugin.updatedAt ? `最近编辑 ${formatDate(plugin.updatedAt)}` : undefined,
    raw: plugin,
  })),
)

const formatDate = (value: string) => {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const loadPlugins = async () => {
  const requestId = ++pluginRequestId
  loading.value = true
  try {
    const result = await listPluginsApi({
      page: 1,
      pageSize: 200,
      name: searchValue.value,
      scope: 'available',
      ...(activeTab.value === allPluginCategoryKey ? {} : { categoryKey: activeTab.value }),
    })
    if (requestId === pluginRequestId) {
      plugins.value = result.items
    }
  } catch {
    if (requestId === pluginRequestId) {
      plugins.value = []
    }
    message.error('插件列表获取失败')
  } finally {
    if (requestId === pluginRequestId) {
      loading.value = false
    }
  }
}

const openDetail = async (item: ListBoxItem) => {
  const plugin = item.raw as PluginItem
  detailRecord.value = plugin
  detailOpen.value = true
  detailLoading.value = true
  try {
    detailRecord.value = await getPluginApi(plugin.id)
  } catch {
    message.error('插件详情获取失败')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

const loadCategories = async () => {
  tabs.value = [{ key: allPluginCategoryKey, title: '全部' }]
  try {
    const categories = await listPluginCategoriesApi()
    tabs.value = [
      { key: allPluginCategoryKey, title: '全部' },
      ...categories.map((category) => ({
        key: category.key,
        title: category.name,
      })),
    ]
  } catch {
    message.error('插件分类获取失败')
  }
}

onMounted(() => {
  void loadCategories()
})

watch(
  activeTab,
  () => {
    plugins.value = []
    void loadPlugins()
  },
  { immediate: true },
)

watch(searchValue, () => {
  void loadPlugins()
})
</script>

<template>
  <ListPage v-model:active-tab="activeTab" v-model:search-value="searchValue" :tabs="tabs">
    <Transition name="plugin-market-tab" mode="out-in">
      <div :key="activeTab" class="plugin-market-tab-panel">
        <ListBox :items="listItems" :loading="loading" :actions="false" @open="openDetail" />
      </div>
    </Transition>
    <PluginDetailDrawer v-model:open="detailOpen" :plugin="detailRecord" :loading="detailLoading" />
  </ListPage>
</template>

<style scoped lang="scss">
.plugin-market-tab-panel {
  min-height: 100%;
}

.plugin-market-tab-enter-active,
.plugin-market-tab-leave-active {
  transition: opacity 0.16s ease;
}

.plugin-market-tab-enter-from {
  opacity: 0;
}

.plugin-market-tab-leave-to {
  opacity: 0;
}
</style>
