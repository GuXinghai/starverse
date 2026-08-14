import { defineConfig } from 'vitest/config'
import { applySlowGate, partitionOverridePaths, sharedResolve, sharedTest } from './vitest.shared'

const integrationInclude = [
  'electron/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'infra/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'tests/integration/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'tests/e2e/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'scripts/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  'tools/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
  ...partitionOverridePaths.integration,
]

const integrationExclude = [
  'tests/e2e/**/*ui*.test.*',
  ...partitionOverridePaths.unit,
  ...partitionOverridePaths.ui,
]

const slow = applySlowGate(integrationInclude, 'integration')

export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    environment: 'node',
    setupFiles: ['./tests/setup-node.ts'],
    pool: 'forks',
    maxWorkers: 2,
    include: slow.include,
    exclude: [...slow.exclude, ...integrationExclude],
  },
})
