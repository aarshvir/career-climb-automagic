import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Vite's built-in transformer keeps tests independent of SWC's native cache.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test-utils/', 'dist/', '**/*.d.ts']
    },
    globals: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
