import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const overridesPath = path.join(repoRoot, 'tests', 'test-partition-overrides.json')
const testSuffix = /\.(?:test|spec)\.[cm]?[jt]sx?$/i
const slowSuffix = /(?:^|[._-])slow(?:[._-]|$)/i

function readOverrides() {
  return JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
}

function normalized(value) {
  return value.replaceAll('\\', '/')
}

function isGlobalTestInfrastructure(file) {
  return [
    'package.json',
    'package-lock.json',
    'vitest.shared.ts',
    'tests/test-partition-overrides.json',
    'scripts/check-test-partitions.mjs',
    'scripts/resolve-test-ci-scope.mjs',
    '.nvmrc',
    '.github/workflows/ci.yml',
  ].includes(file)
}

// Shared trees imported by both Electron/infra and renderer code (P8-03).
// src/next/ keeps override-based routing; pushes to main run every partition.
function isSharedSource(file) {
  return ['src/core/', 'src/shared/', 'config/', 'tests/helpers/', 'tests/fixtures/', 'tests/utils/']
    .some(prefix => file.startsWith(prefix)) && !testSuffix.test(file)
}

function testOwner(file, overrides) {
  if (overrides[file]) return overrides[file]
  if (file.startsWith('src/ui-app/') || file.startsWith('src/ui-kit/') ||
      (file.startsWith('tests/e2e/') && /ui/i.test(file))) return 'ui'
  if (file.startsWith('electron/') || file.startsWith('infra/') ||
      file.startsWith('tests/integration/') || file.startsWith('tests/e2e/') ||
      file.startsWith('scripts/')) return 'integration'
  return 'unit'
}

function sourceOwners(file, overrides) {
  const owners = new Set()
  for (const [testFile, owner] of Object.entries(overrides)) {
    if (!testSuffix.test(testFile)) continue
    const sourceFile = testFile.replace(/\.(?:test|spec)(\.[cm]?[jt]sx?)$/iu, '$1')
    if (sourceFile === file) owners.add(owner)
  }
  return owners
}

/**
 * Resolve optional test partitions for a changed-file set. Unit is deliberately
 * always handled by CI; only UI and integration are conditional.
 */
export function resolveTestCiScope(changedFiles, { baseAvailable = true, fullRun = false, overrides = readOverrides() } = {}) {
  if (fullRun) return { ui: true, integration: true, reason: 'full-run' }
  if (!baseAvailable) return { ui: true, integration: true, reason: 'base-unavailable' }

  let ui = false
  let integration = false
  for (const rawFile of changedFiles) {
    const file = normalized(rawFile)
    if (!file) continue
    if (isGlobalTestInfrastructure(file)) {
      ui = true
      integration = true
      continue
    }
    if (slowSuffix.test(path.basename(file))) continue
    if (isSharedSource(file)) {
      ui = true
      integration = true
    }
    if (file.startsWith('src/ui-app/') || file.startsWith('src/ui-kit/') ||
        file.endsWith('.vue') || file === 'tests/setup-ui.ts' ||
        file.startsWith('tests/helpers/electronBridge') || file.startsWith('tests/helpers/generationV2Bridge') ||
        file === 'vitest.ui.config.ts') ui = true
    if (file.startsWith('electron/') || file.startsWith('infra/') || file.startsWith('native/') ||
        file.startsWith('tools/provider-key-vault/') ||
        file.startsWith('tests/integration/') ||
        (file.startsWith('tests/e2e/') && !/ui/i.test(file)) ||
        file === 'tests/setup-node.ts' || file === 'vitest.integration.config.ts' ||
        file.startsWith('scripts/')) integration = true
    if (testSuffix.test(file)) {
      const owner = testOwner(file, overrides)
      if (owner === 'ui') ui = true
      if (owner === 'integration') integration = true
    }
    for (const owner of sourceOwners(file, overrides)) {
      if (owner === 'ui') ui = true
      if (owner === 'integration') integration = true
    }
  }
  return { ui, integration, reason: 'paths' }
}

function baseExists(base) {
  if (!base || /^0+$/u.test(base)) return false
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: repoRoot, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function changedFilesSince(base) {
  return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split(/\r?\n/u).filter(Boolean)
}

function writeGithubOutput(scope) {
  if (!process.env.GITHUB_OUTPUT) return
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `ui=${scope.ui}\nintegration=${scope.integration}\nreason=${scope.reason}\n`, 'utf8')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.env.GITHUB_BASE_SHA ?? ''
  const fullRun = process.env.SV_TEST_SCOPE_FULL === 'true'
  const available = fullRun || baseExists(base)
  const scope = resolveTestCiScope(available && !fullRun ? changedFilesSince(base) : [], { baseAvailable: available, fullRun })
  writeGithubOutput(scope)
  process.stdout.write(`${JSON.stringify(scope)}\n`)
}
