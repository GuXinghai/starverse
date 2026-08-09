import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/.external-runtime-work/**',
      '**/.starverse-engines/**',
      '**/managed-runtimes/**',
      '**/staging/**',
      '**/sandbox/**',
      '**/temp/**',
      '**/tmp/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/dist-native/**',
      '**/release/**',
      '**/out/**',
    ],
    env: {
      SV_TEST_VERBOSE_OPENROUTER: process.env.SV_TEST_VERBOSE_OPENROUTER ?? '0',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/**/*.spec.ts',
        'src/**/*.test.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
