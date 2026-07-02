import type { Component } from 'vue'
import type { ListPageConfig } from '@/components/ListPage/types'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: Component
    tag?: string
    activeMenu?: string
    listPage?: ListPageConfig
  }
}
