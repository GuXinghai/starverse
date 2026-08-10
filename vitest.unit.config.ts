import { defineConfig } from 'vitest/config'
import { applySlowGate, partitionOverridePaths, sharedResolve, sharedTest } from './vitest.shared'

const unitInclude = [
  'config/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/shared/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/next/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'src/ui-app/rendererImportBoundary.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'tools/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  ...partitionOverridePaths.unit,
]

const unitExclude = [
  'src/ui-app/components/**/*.test.*',
  'src/ui-app/infra/**/*.test.*',
  'src/ui-app/prefs/**/*.test.*',
  'src/ui-app/AppChatApp*.test.*',
  'src/ui-app/**/*.ui.test.*',
  ...partitionOverridePaths.ui,
  ...partitionOverridePaths.integration,
  'tests/e2e/**',
  'tests/integration/**',
  'electron/**/*.test.*',
  'infra/**/*.test.*',
  'scripts/**/*.test.*',
]

const slow = applySlowGate(unitInclude)

export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    environment: 'node',
    setupFiles: ['./tests/setup-node.ts'],
    include: slow.include,
    exclude: [...slow.exclude, ...unitExclude],
  },
})
