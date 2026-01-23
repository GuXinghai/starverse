import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function fail(message) {
  const err = new Error(message)
  err.name = 'GateCheckFailure'
  throw err
}

function rgFiles(pattern, rootDir) {
  const result = spawnSync(
    'rg',
    ['--files-with-matches', '--no-messages', '--hidden', '--glob', '!.git/**', '--', pattern, rootDir],
    { encoding: 'utf8', shell: process.platform === 'win32' }
  )

  if (result.error) {
    fail(`ripgrep (rg) not found in PATH; required for tc17 gate. Details: ${result.error.message}`)
  }
  if (result.status === 1) return []
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().trim()
    fail(`rg failed for pattern '${pattern}' in '${rootDir}' (exit=${result.status})${stderr ? `: ${stderr}` : ''}`)
  }
  return (result.stdout || '')
    .toString()
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)
}

function assertUiDir(dir) {
  if (!fs.existsSync(dir)) return

  const bannedPatterns = [
    "from\\s+['\"]@/stores",
    "from\\s+['\"]@/services",
    "from\\s+['\"]@/components",
    "from\\s+['\"]@/composables",
    "from\\s+['\"]@/utils",
    "from\\s+['\"]@/types",
    "from\\s+['\"]\\.{1,2}/.*stores",
    "from\\s+['\"]\\.{1,2}/.*services",
    "from\\s+['\"]\\.{1,2}/.*components",
    "from\\s+['\"]\\.{1,2}/.*composables",
    "from\\s+['\"]\\.{1,2}/.*utils",
  ]

  for (const pattern of bannedPatterns) {
    const hits = rgFiles(pattern, dir)
    if (hits.length > 0) {
      fail(`${dir} imports legacy module (pattern: ${pattern}). Hits: ${hits.slice(0, 10).join(', ')}`)
    }
  }

  const jsonParseHits = rgFiles('JSON\\.parse\\(', dir)
  if (jsonParseHits.length > 0) {
    fail(`${dir} must not call JSON.parse directly. Hits: ${jsonParseHits.slice(0, 10).join(', ')}`)
  }
}

try {
  section('TC-17 — UI guardrails (ui-next + ui-app)')
  assertUiDir('src/ui-next')
  assertUiDir('src/ui-app')
  console.log('PASS: UI guardrails hold (no legacy imports, no JSON.parse usage).')
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
}

