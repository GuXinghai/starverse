import { configDefaults } from 'vitest/config'
import fs from 'node:fs'
import path from 'node:path'
import partitionOverrides from './tests/test-partition-overrides.json'

// Keep both conventional positions (`foo.slow.test.ts` and
// `foo.test.slow.ts`) covered without excluding unrelated files whose names
// merely contain the word "slow".
export const SLOW_TEST_GLOBS = ['**/*.slow.test.*', '**/*.test.slow.*']

export const sharedTestExclude = [
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
]

export const sharedResolve = {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}

export const sharedTest = {
  globals: true,
  exclude: sharedTestExclude,
  env: {
    SV_TEST_VERBOSE_OPENROUTER: process.env.SV_TEST_VERBOSE_OPENROUTER ?? '0',
  },
  coverage: {
    provider: 'v8' as const,
    reporter: ['text', 'json', 'html'],
    include: ['src/**/*.{ts,vue}'],
    exclude: [
      'src/**/*.d.ts',
      'src/types/**',
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
    ],
  },
}

export const partitionOverridePaths = {
  unit: Object.entries(partitionOverrides)
    .filter(([, owner]) => owner === 'unit')
    .map(([repoPath]) => repoPath),
  ui: Object.entries(partitionOverrides)
    .filter(([, owner]) => owner === 'ui')
    .map(([repoPath]) => repoPath),
  integration: Object.entries(partitionOverrides)
    .filter(([, owner]) => owner === 'integration')
    .map(([repoPath]) => repoPath),
}

function cliTestPaths() {
  return process.argv.slice(2).filter((arg) =>
    !arg.startsWith('-') && /\.(?:test|spec)(?:\.[^.]+)*\.[cm]?[jt]sx?$/.test(arg)
  )
}

/**
 * Slow suites are opt-in and intentionally narrow: SV_TEST_SLOW=1 plus one
 * explicit slow-segment test CLI path.  Without both conditions, slow files
 * remain excluded even when a broad Vitest command is used.
 */
function ownerForTestPath(repoPath: string): 'unit' | 'ui' | 'integration' {
  const override = (partitionOverrides as Record<string, string>)[repoPath]
  if (override === 'unit' || override === 'ui' || override === 'integration') return override
  if (repoPath.startsWith('src/ui-app/') || repoPath.startsWith('src/ui-kit/') ||
      (repoPath.startsWith('tests/e2e/') && /ui/i.test(repoPath))) return 'ui'
  if (repoPath.startsWith('electron/') || repoPath.startsWith('infra/') || repoPath.startsWith('tests/integration/') ||
      repoPath.startsWith('tests/e2e/')) return 'integration'
  return 'unit'
}

export function applySlowGate(include: string[], owner: 'ui' | 'integration') {
  const paths = cliTestPaths()
  const slowPaths = paths.filter((arg) => /(?:^|[._-])slow(?:[._-]|$)/i.test(path.basename(arg)))
  if (process.env.SV_TEST_SLOW === '1') {
    if (slowPaths.length !== 1 || paths.length !== 1) {
      throw new Error('SV_TEST_SLOW_REQUIRES_ONE_EXPLICIT_SLOW_TEST_FILE')
    }
    const requested = slowPaths[0]
    const absolute = path.resolve(requested)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error('SV_TEST_SLOW_FILE_NOT_FOUND')
    }
    const repoPath = path.relative(process.cwd(), absolute).replaceAll('\\', '/')
    if (ownerForTestPath(repoPath) !== owner) {
      throw new Error(`SV_TEST_SLOW_WRONG_OWNER:${ownerForTestPath(repoPath)}`)
    }
    return { include: [repoPath], exclude: sharedTestExclude }
  }
  return { include, exclude: [...sharedTestExclude, ...SLOW_TEST_GLOBS] }
}
