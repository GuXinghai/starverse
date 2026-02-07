#!/usr/bin/env node
/* eslint-env node */

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const CODE_EXT_RE = /\.(ts|tsx|vue)$/i

function runGit(args, options = {}) {
  const { optional = false } = options
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch (error) {
    if (optional) return ''
    throw error
  }
}

function resolveBaseCommit() {
  const envBaseSha = String(process.env.GITHUB_BASE_SHA || '').trim()
  if (envBaseSha) return envBaseSha

  const envBaseRef = String(process.env.GITHUB_BASE_REF || '').trim()
  if (envBaseRef) {
    const fromOrigin = runGit(['merge-base', 'HEAD', `origin/${envBaseRef}`], { optional: true })
    if (fromOrigin) return fromOrigin
    const fromLocal = runGit(['merge-base', 'HEAD', envBaseRef], { optional: true })
    if (fromLocal) return fromLocal
  }

  const candidates = ['origin/main', 'origin/master', 'main', 'master']
  for (const ref of candidates) {
    const base = runGit(['merge-base', 'HEAD', ref], { optional: true })
    if (base) return base
  }

  return 'HEAD~1'
}

function readChangedFiles(base) {
  const ranges = [`${base}...HEAD`, `${base}..HEAD`]
  for (const range of ranges) {
    const out = runGit(['diff', '--name-only', '--diff-filter=ACMR', range], { optional: true })
    if (!out) continue
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function toLintTargets(files) {
  return files
    .filter((file) => CODE_EXT_RE.test(file))
    .filter((file) => fs.existsSync(path.resolve(process.cwd(), file)))
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

function main() {
  const base = resolveBaseCommit()
  console.log(`[lint:changed] base=${base}`)

  const changed = readChangedFiles(base)
  const targets = toLintTargets(changed)

  if (targets.length === 0) {
    console.log('[lint:changed] no changed .ts/.tsx/.vue files, skipping')
    return
  }

  console.log(`[lint:changed] linting ${targets.length} file(s)`)
  for (const file of targets) console.log(`- ${file}`)
  runEslint(targets)
}

main()

