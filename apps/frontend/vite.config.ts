import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

const resolvePackageName = (id: string) => {
  const segments = id.split('/node_modules/')
  const packagePath = segments[segments.length - 1] ?? ''
  const [scopeOrName, name] = packagePath.split('/')

  return scopeOrName?.startsWith('@') && name ? `${scopeOrName}/${name}` : scopeOrName
}

const safeChunkName = (value: string) => value.replace(/^@/, '').replace(/[^a-z0-9_-]+/gi, '-')

const vendorChunk = (id: string) => {
  if (!id.includes('/node_modules/')) return undefined
  if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia')) {
    return 'vendor-vue'
  }
  if (id.includes('/antdv-next/') || id.includes('/ant-design-x-vue/')) {
    return undefined
  }
  if (id.includes('/@antdv-next/icons/') || id.includes('/@lucide/vue/')) {
    return 'vendor-icons'
  }
  if (id.includes('/markdown-it/') || id.includes('/dompurify/')) {
    return 'vendor-markdown'
  }

  const packageName = resolvePackageName(id)
  return packageName ? `vendor-${safeChunkName(packageName)}` : 'vendor'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
})
