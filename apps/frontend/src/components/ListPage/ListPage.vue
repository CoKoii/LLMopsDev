<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()

const pageTitle = computed(() => route.meta.title)
const pageIcon = computed(() => route.meta.icon)
</script>

<template>
  <div class="ListPage">
    <div class="header">
      <div class="logo_btn">
        <div class="logo">
          <div class="img">
            <component :is="pageIcon" v-if="pageIcon" />
          </div>
          <div class="title">{{ pageTitle }}</div>
        </div>
        <div class="btn"></div>
      </div>
      <div class="tab_search">
        <div class="tabs"></div>
        <div class="search"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ListPage {
  padding: 2.4rem;
  height: 100%;
}
</style>
