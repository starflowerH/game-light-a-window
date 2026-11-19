import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    reporters: 'verbose',
    // Fastify's very first instantiation inside a vitest worker is slow on a
    // cold module graph (tens of seconds on WSL / Windows-mounted disks).
    // The API suite is an integration test, so give it room instead of flaking.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
