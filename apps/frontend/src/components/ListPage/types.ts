import type { RouteLocationRaw } from 'vue-router'

export interface ListPageTab {
  title: string
  to: RouteLocationRaw
}

export interface ListPageConfig {
  createText?: string
  tabs?: ListPageTab[]
}
