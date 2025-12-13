import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
    fail(`ripgrep (rg) not found in PATH; required for tc10 gate. Details: ${result.error.message}`)
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

function normalize(p) {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function assertNoUiNextLegacyImports() {
  const root = 'src/ui-next'
  if (!fs.existsSync(root)) fail('src/ui-next does not exist')

  const bannedPatterns = [
    // forbid legacy store/service/parser access from ui-next subtree
    "from\\s+['\"]@/stores",
    "from\\s+['\"]@/services",
    "from\\s+['\"]@/components",
    "from\\s+['\"]@/composables",
    "from\\s+['\"]@/utils",
    "from\\s+['\"]\\.{1,2}/.*stores",
    "from\\s+['\"]\\.{1,2}/.*services",
    "from\\s+['\"]\\.{1,2}/.*components",
    "from\\s+['\"]\\.{1,2}/.*composables",
    "from\\s+['\"]\\.{1,2}/.*utils",
  ]

  for (const pattern of bannedPatterns) {
    const hits = rgFiles(pattern, root)
    if (hits.length > 0) {
      fail(`ui-next imports legacy module (pattern: ${pattern}). Hits: ${hits.slice(0, 10).join(', ')}`)
    }
  }

  // ui-next must not parse OpenRouter JSON directly (no JSON.parse in ui-next)
  const jsonParseHits = rgFiles('JSON\\.parse\\(', root)
  if (jsonParseHits.length > 0) {
    fail(`ui-next must not call JSON.parse directly. Hits: ${jsonParseHits.slice(0, 10).join(', ')}`)
  }
}

try {
  section('TC-10 — ui-next guardrails')
  assertNoUiNextLegacyImports()
  console.log('PASS: ui-next has no legacy imports and no JSON.parse usage.')
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
}
