import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/contentScript.ts', import.meta.url)),
      name: 'LlmopsClipperContent',
      formats: ['iife'],
      fileName: () => 'assets/content.js',
    },
    rolldownOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
