import type { Component } from 'vue'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: Component
    tag?: string
  }
}
