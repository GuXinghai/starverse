#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OVERRIDES_PATH = path.join(REPO_ROOT, 'tests', 'test-partition-overrides.json')
const TEST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const OWNERS = new Set(['unit', 'ui', 'integration'])

function normalizeRepoPath(input) {
  return String(input).replaceAll('\\', '/').replace(/^\.\//u, '')
}

function isTestOrSpecFile(repoPath) {
  const extension = path.posix.extname(repoPath).toLowerCase()
  if (!TEST_EXTENSIONS.has(extension)) return false

  const baseName = path.posix.basename(repoPath)
  // Vitest's conventional test/spec suffixes, including `.real.test.*` and
  // `.test.slow.*` variants. This intentionally excludes test helpers and
  // executable scripts whose names merely contain the word "test".
  return /\.(?:test|spec)(?:\.[^.]+)+$/iu.test(baseName)
}

function discoverTestFiles() {
  let output
  try {
    output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git ls-files failed: ${detail}`)
  }

  return output
    .split('\0')
    .map(normalizeRepoPath)
    .filter(Boolean)
    .filter((repoPath) => {
      if (!isTestOrSpecFile(repoPath)) return false
      try {
        return fs.statSync(path.join(REPO_ROOT, repoPath)).isFile()
      } catch {
        return false
      }
    })
    .sort((left, right) => left.localeCompare(right))
}

function defaultOwner(repoPath) {
  const normalized = normalizeRepoPath(repoPath)
  const lower = normalized.toLowerCase()

  // Renderer/component tests are UI-owned. E2E files opt into the UI owner
  // when their path contains `ui`; the remaining E2E smoke tests are integration.
  if (lower.startsWith('src/ui-app/') || lower.startsWith('src/ui-kit/')) return 'ui'
  if (lower.startsWith('tests/e2e/') && lower.includes('ui')) return 'ui'

  if (
    lower.startsWith('tests/e2e/')
    || lower.startsWith('electron/')
    || lower.startsWith('infra/')
    || lower.startsWith('tests/integration/')
  ) return 'integration'

  return 'unit'
}

function loadOverrides(errors) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    errors.push(`unable to read ${normalizeRepoPath(path.relative(REPO_ROOT, OVERRIDES_PATH))}: ${detail}`)
    return new Map()
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push('test-partition-overrides.json must be a JSON object mapping repository paths to owners')
    return new Map()
  }

  const overrides = new Map()
  for (const [rawPath, owner] of Object.entries(parsed)) {
    const repoPath = normalizeRepoPath(rawPath)
    if (!repoPath) {
      errors.push('override path must not be empty')
      continue
    }
    if (overrides.has(repoPath)) {
      errors.push(`duplicate override path after normalization: ${repoPath}`)
      continue
    }
    overrides.set(repoPath, owner)
  }
  return overrides
}

function isSlowTest(repoPath) {
  const baseName = path.posix.basename(repoPath).toLowerCase()
  return /(?:^|[._-])slow(?:[._-]|$)/u.test(baseName)
}

function main() {
  const errors = []
  const files = discoverTestFiles()
  const overrides = loadOverrides(errors)
  const discovered = new Set(files)
  const assignments = new Map()

  for (const [repoPath, owner] of overrides) {
    if (!discovered.has(repoPath)) {
      errors.push(`override path is not an unignored discovered test/spec file: ${repoPath}`)
      continue
    }
    if (typeof owner !== 'string' || !OWNERS.has(owner)) {
      errors.push(`override owner for ${repoPath} must be one of: unit, ui, integration`)
      continue
    }
    assignments.set(repoPath, owner)
  }

  for (const repoPath of files) {
    const owner = assignments.get(repoPath) ?? defaultOwner(repoPath)
    if (!OWNERS.has(owner)) {
      errors.push(`discovered file has no valid owner: ${repoPath}`)
      continue
    }
    assignments.set(repoPath, owner)
    if (isSlowTest(repoPath) && owner === 'unit') {
      errors.push(`slow test must be ui or integration-owned: ${repoPath}`)
    }
  }

  for (const repoPath of files) {
    if (!assignments.has(repoPath)) errors.push(`discovered file has no owner: ${repoPath}`)
  }

  const counts = { unit: 0, ui: 0, integration: 0 }
  for (const owner of assignments.values()) {
    if (Object.hasOwn(counts, owner)) counts[owner] += 1
  }

  console.log('Test partition gate')
  console.log(`Discovered test/spec files: ${files.length}`)
  console.log(`Owners: unit=${counts.unit}, ui=${counts.ui}, integration=${counts.integration}`)
  console.log(`Overrides: ${overrides.size}`)
  if (errors.length > 0) {
    console.error(`Errors: ${errors.length}`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log('PASS: every discovered test/spec file has exactly one valid owner')
}

try {
  main()
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`Errors: 1\n- ${detail}`)
  process.exitCode = 1
}
