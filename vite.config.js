import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('three/examples/jsm/')) {
            return 'three-examples'
          }
          if (id.includes('node_modules/three/')) {
            return 'three-core'
          }
        }
      }
    }
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3101' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:3101' } }
})

