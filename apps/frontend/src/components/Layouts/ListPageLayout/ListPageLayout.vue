<script setup lang="ts">
import ListPage from '@/components/ListPage/ListPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const layoutRecord = computed(() => route.matched.find((record) => record.meta.listPage))

const listPageConfig = computed(() => layoutRecord.value?.meta.listPage)
</script>

<template>
  <ListPage
    :title="layoutRecord?.meta.title"
    :icon="layoutRecord?.meta.icon"
    :create-text="listPageConfig?.createText"
    :tabs="listPageConfig?.tabs"
  >
    <div class="content">
      <RouterView />
    </div>
  </ListPage>
</template>
<style scoped lang="scss">
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
