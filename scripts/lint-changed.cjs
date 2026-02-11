#!/usr/bin/env node
/* eslint-env node */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const CODE_EXT_RE = /\.(ts|tsx|vue)$/i

function formatCmd(cmd, args) {
  return [cmd, ...args].join(' ')
}

function failGit(command, result, suggestion) {
  const code = typeof result.status === 'number' ? result.status : 1
  const stderr = String(result.stderr || '').trim() || '(empty stderr)'
  console.error(`[lint:changed] ERROR: command failed: ${command}`)
  console.error(`[lint:changed] exit_code=${code} stderr=${stderr}`)
  if (suggestion) console.error(`[lint:changed] suggestion: ${suggestion}`)
  process.exit(1)
}

function runGit(args, suggestion) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    failGit(formatCmd('git', args), result, suggestion)
  }
  return String(result.stdout || '').trim()
}

function lines(out) {
  if (!out) return []
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toLintTargets(files, keepMissing = false) {
  return files
    .filter((file) => CODE_EXT_RE.test(file))
    .filter((file) => keepMissing || fs.existsSync(path.resolve(process.cwd(), file)))
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function runEslint(files) {
  const groups = chunk(files, 80)
  for (const group of groups) {
    const args = ['eslint', '--max-warnings=0', ...group]
    const result = spawnSync('npx', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (result.status !== 0) {
      process.exit(result.status || 1)
    }
  }
}

function isCiMode() {
  const envBaseSha = String(process.env.GITHUB_BASE_SHA || '').trim()
  if (envBaseSha) return true
  const hasPrContext = Boolean(String(process.env.GITHUB_BASE_REF || '').trim())
  return hasPrContext
}

function collectCiTargets() {
  const base = String(process.env.GITHUB_BASE_SHA || '').trim()
  const baseRef = String(process.env.GITHUB_BASE_REF || '').trim()
  if (!base) {
    console.error('[lint:changed] ERROR: CI mode requires GITHUB_BASE_SHA, but it is empty')
    console.error('[lint:changed] suggestion: pass GITHUB_BASE_SHA from workflow pull_request base sha')
    process.exit(1)
  }
  runGit(
    ['cat-file', '-e', `${base}^{commit}`],
    'Ensure checkout uses fetch-depth: 0 and GITHUB_BASE_SHA points to an existing commit.'
  )
  const range = `${base}...HEAD`
  const changed = lines(
    runGit(
      ['diff', '--name-only', '--diff-filter=ACMR', range],
      'Ensure base sha is valid and repository history is complete (fetch-depth: 0).'
    )
  )
  const targets = toLintTargets(changed)
  console.log(
    `[lint:changed] mode=ci base_source=GITHUB_BASE_SHA range=${range} base_ref=${baseRef || '-'} changed_count=${changed.length} target_count=${targets.length}`
  )
  return targets
}

function collectLocalTargets() {
  const includeUntracked = String(process.env.LINT_CHANGED_INCLUDE_UNTRACKED || '1') !== '0'
  const staged = lines(
    runGit(
      ['diff', '--name-only', '--cached', '--diff-filter=ACMR'],
      'Confirm you are inside a git repo and HEAD exists (e.g. create an initial commit).'
    )
  )
  const unstaged = lines(
    runGit(
      ['diff', '--name-only', '--diff-filter=ACMR'],
      'Confirm you are inside a git repo and working tree is accessible.'
    )
  )
  const untracked = includeUntracked
    ? lines(
        runGit(
          ['ls-files', '--others', '--exclude-standard'],
          'Confirm you are inside a git repo and git index is available.'
        )
      )
    : []
  const changed = Array.from(new Set([...staged, ...unstaged, ...untracked]))
  const targets = toLintTargets(changed)
  console.log(
    `[lint:changed] mode=local base_source=worktree staged=${staged.length} unstaged=${unstaged.length} untracked=${untracked.length} target_count=${targets.length}`
  )
  return targets
}

function main() {
  const mode = isCiMode() ? 'ci' : 'local'
  const targets = mode === 'ci' ? collectCiTargets() : collectLocalTargets()

  if (targets.length === 0) {
    console.log('[lint:changed] no changed files, skip')
    return
  }

  console.log(`[lint:changed] linting ${targets.length} file(s)`)
  for (const file of targets) console.log(`- ${file}`)
  runEslint(targets)
}

main()
