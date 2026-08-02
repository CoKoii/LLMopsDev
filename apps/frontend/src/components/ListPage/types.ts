import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export interface ListPageTab {
  key: string
  title: string
  to?: RouteLocationRaw
}

export interface ListPageProps {
  title?: string
  description?: string
  icon?: Component
  createText?: string
  tabs?: ListPageTab[]
  searchPlaceholder?: string
  showSearch?: boolean
  searchProps?: Record<string, unknown>
}
