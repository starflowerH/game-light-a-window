import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  server: { proxy: { '/api': 'http://127.0.0.1:3101' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:3101' } }
})
