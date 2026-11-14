import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  server: { proxy: { '/api': 'http://127.0.0.1:3101' } }
})
