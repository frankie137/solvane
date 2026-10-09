import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: [
      'shared/**/*.test.ts',
      'cloud/**/*.test.ts',
      'src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
  },
})
