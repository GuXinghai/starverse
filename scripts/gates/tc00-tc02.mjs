import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const skipTests = args.has('--skip-tests')

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function fail(message) {
  const err = new Error(message)
  err.name = 'GateCheckFailure'
  throw err
}

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`)
}

function readText(filePath) {
  assertFileExists(filePath)
  return fs.readFileSync(filePath, 'utf8')
}

function assertIncludes(haystack, needle, hint) {
  if (!haystack.includes(needle)) {
    fail(`Missing expected content (${hint}): '${needle}'`)
  }
}

function normalizeFilePath(filePath) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.error) throw result.error
  return result.status ?? 0
}

function runNpm(npmArgs) {
  const result = spawnSync('npm', npmArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  return result.status ?? 0
}

function rgFiles(pattern, rootDir) {
  const result = spawnSync(
    'rg',
    [
      '--files-with-matches',
      '--no-messages',
      '--hidden',
      '--glob',
      '!.git/**',
      '--',
      pattern,
      rootDir,
    ],
    { encoding: 'utf8', shell: false }
  )

  if (result.error) {
    fail(`ripgrep (rg) not found in PATH; install rg. Details: ${result.error.message}`)
  }

  if (result.status === 1) return []
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().trim()
    fail(`rg failed for pattern '${pattern}' in '${rootDir}' (exit=${result.status})${stderr ? `: ${stderr}` : ''}`)
  }

  const stdout = (result.stdout || '').toString()
  return stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
}

function rgCount(pattern, rootDir) {
  const result = spawnSync(
    'rg',
    [
      '--count-matches',
      '--no-messages',
      '--hidden',
      '--glob',
      '!.git/**',
      '--',
      pattern,
      rootDir,
    ],
    { encoding: 'utf8', shell: false }
  )

  if (result.error) {
    fail(`ripgrep (rg) not found in PATH; install rg. Details: ${result.error.message}`)
  }

  if (result.status === 1) return 0
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().trim()
    fail(`rg failed for pattern '${pattern}' in '${rootDir}' (exit=${result.status})${stderr ? `: ${stderr}` : ''}`)
  }

  const stdout = (result.stdout || '').toString().trim()
  if (!stdout) return 0

  let sum = 0
  for (const line of stdout.split(/\r?\n/g)) {
    const parts = line.split(':')
    const n = parts.at(-1)
    if (n && /^\d+$/.test(n)) sum += Number.parseInt(n, 10)
  }
  return sum
}

function assertOnlyFilesMatch(pattern, rootDir, allowedFiles) {
  const hits = rgFiles(pattern, rootDir)
  const allowed = new Set(allowedFiles.map(normalizeFilePath))

  for (const hit of hits) {
    const resolvedHit = normalizeFilePath(hit)
    if (!allowed.has(resolvedHit)) {
      fail(`Pattern '${pattern}' leaked outside allowlist. Hit: ${hit}`)
    }
  }
}

function assertMatchesAtLeast(pattern, rootDir, minCount) {
  const count = rgCount(pattern, rootDir)
  if (count < minCount) {
    fail(`Expected at least ${minCount} matches for pattern '${pattern}' in '${rootDir}', got ${count}`)
  }
}

const startedAt = Date.now()

section('TC-00 ~ TC-01 Gate Check (15–30 min)')

try {
  // ────────────────────────────────────────────────────────────────
  // TC-00 — SSOT alignment quick checks
  // ────────────────────────────────────────────────────────────────
  section('TC-00 — Artifacts present')
  assertFileExists('docs/refactor/plan.md')
  assertFileExists('docs/refactor/compliance-checklist.md')
  assertFileExists('docs/refactor/risk-log.md')
  console.log('PASS: docs/refactor artifacts exist.')

  section('TC-00 — Checklist is executable (hard constraints)')
  const checklist = readText('docs/refactor/compliance-checklist.md')
  assertIncludes(checklist, '[ ]', 'checkbox')
  assertIncludes(checklist, '不得在 Parser 层写入任何 store', 'SSOT invariant')
  assertIncludes(checklist, '不得在 UI 层直接解析 OpenRouter JSON', 'SSOT invariant')
  assertIncludes(checklist, '不得重排、不得修改、不得合并重写', 'reasoning_details fidelity')
  assertIncludes(checklist, 'UI 禁止直接 import 旧 store / 旧 service / 旧 parser', 'migration guardrail')
  console.log('PASS: compliance checklist contains key MUST/FORBIDDEN items.')

  section('TC-00 — Gate allowlists are explicit (anti-smear)')
  const plan = readText('docs/refactor/plan.md')
  assertIncludes(plan, '目录 allowlist', 'directory allowlist')
  const allowlistOccurrences = (plan.match(/目录 allowlist/g) || []).length
  if (allowlistOccurrences < 5) {
    fail(`Expected plan.md to define gate allowlists per gate (>=5 occurrences), got ${allowlistOccurrences}`)
  }
  console.log('PASS: plan.md defines per-gate directory allowlists.')

  // ────────────────────────────────────────────────────────────────
  // TC-01 — ADR scaffold quick checks
  // ────────────────────────────────────────────────────────────────
  section('TC-01 — ADR scaffold present')
  assertFileExists('docs/adr/template.md')
  assertFileExists('docs/adr/README.md')

  const template = readText('docs/adr/template.md')
  assertIncludes(template, '## Context', 'Nygard template')
  assertIncludes(template, '## Decision', 'Nygard template')
  assertIncludes(template, '## Consequences', 'Nygard template')

  const adrReadme = readText('docs/adr/README.md')
  assertIncludes(adrReadme, 'NNN-title.md', 'naming rule')
  for (const status of ['Proposed', 'Accepted', 'Deprecated', 'Superseded']) {
    assertIncludes(adrReadme, status, 'status enum')
  }
  assertIncludes(adrReadme, '必须', 'enforceable trigger rules')
  assertIncludes(adrReadme, 'SSOT', 'enforceable trigger rules')

  const adrFiles = fs
    .readdirSync('docs/adr', { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{3}-.*\.md$/.test(entry.name))
  if (adrFiles.length < 1) {
    fail('Expected at least 1 numbered ADR (NNN-title.md) in docs/adr/')
  }
  console.log('PASS: ADR scaffold + at least 1 numbered ADR exist.')

  const elapsedSec = (Date.now() - startedAt) / 1000
  section('RESULT')
  console.log(`PASS: TC-00~TC-01 gate checks completed in ${elapsedSec.toFixed(1)}s`)
  process.exit(0)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${message}\n`)
  process.exit(1)
}
