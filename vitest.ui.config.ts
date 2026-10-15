import vue from '@vitejs/plugin-vue'
import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'
import { applySlowGate, partitionOverridePaths, sharedResolve, sharedTest } from './vitest.shared'

const uiInclude = [
  'src/ui-app/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/app/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/components/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/infra/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/prefs/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/composables/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-kit/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'tests/e2e/**/*ui*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  ...partitionOverridePaths.ui,
]

const uiExclude = [
  'src/ui-app/rendererImportBoundary.test.*',
  ...partitionOverridePaths.unit,
  ...partitionOverridePaths.integration,
]

const slow = applySlowGate(uiInclude, 'ui')

export default defineConfig({
  plugins: [vue()],
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    environment: 'jsdom',
    // Bound memory-heavy jsdom/SQLite forks instead of scaling to every logical CPU.
    maxWorkers: Math.min(2, availableParallelism()),
    setupFiles: ['./tests/setup-ui.ts'],
    include: slow.include,
    exclude: [...slow.exclude, ...uiExclude],
  },
})
