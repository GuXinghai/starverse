import fs from 'node:fs'
import path from 'node:path'

// TC-17 — UI guardrails (ui-app)
//
// Scope (current contract):
//   * Layering / legacy-import isolation is owned by TC-18 (tc18-ui-isolation.mjs), which resolves
//     specifiers semantically. The older regex import bans that lived here were superseded by it
//     and misfired on legitimate sibling imports (./components, ../composables), so they were retired.
//   * Renderer code must not parse provider/wire payloads. Direct JSON.parse in non-test ui-app code is
//     therefore allowed only at reviewed, local-data sites listed below. Counts are exact: adding a new
//     JSON.parse site, or removing one without updating this list, fails the gate and forces a review.

const UI_DIR = 'src/ui-app'
const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'release'])
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

const JSON_PARSE_ALLOWLIST = new Map([
  ['src/ui-app/app/appChatApp.logic.ts', { count: 1, reason: 'deep clone of a local semantic-intent object' }],
  ['src/ui-app/AppChatApp.vue', { count: 2, reason: 'pretty-print of already-stored diagnostic payload text for display' }],
  ['src/ui-app/components/CapabilityRulesUserPanel.vue', { count: 1, reason: 'user-selected rules import file; result is validated as unknown downstream' }],
  ['src/ui-app/components/compatible/CompatibleProviderSettingsPanel.vue', { count: 9, reason: 'user-edited JSON form fields in the settings editor' }],
])

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function fail(message) {
  const err = new Error(message)
  err.name = 'GateCheckFailure'
  throw err
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(abs, out)
    } else if (entry.isFile() && INCLUDE_EXTS.has(path.extname(entry.name)) && !TEST_FILE.test(entry.name)) {
      out.push(abs)
    }
  }
}

function main() {
  section('TC-17 — UI guardrails (ui-app)')
  if (!fs.existsSync(UI_DIR)) fail(`Missing directory: ${UI_DIR}`)

  const files = []
  walk(UI_DIR, files)
  console.log(`Files scanned: ${files.length}`)

  const counts = new Map()
  for (const abs of files) {
    const rel = abs.split(path.sep).join('/')
    const n = (fs.readFileSync(abs, 'utf8').match(/JSON\.parse\(/g) ?? []).length
    if (n > 0) counts.set(rel, n)
  }

  const problems = []
  for (const [rel, n] of counts) {
    const allowed = JSON_PARSE_ALLOWLIST.get(rel)
    if (!allowed) problems.push(`${rel}: ${n} JSON.parse call(s), file is not in the reviewed allowlist`)
    else if (n !== allowed.count) problems.push(`${rel}: ${n} JSON.parse call(s), allowlist expects ${allowed.count} (${allowed.reason})`)
  }
  for (const rel of JSON_PARSE_ALLOWLIST.keys()) {
    if (!counts.has(rel)) problems.push(`${rel}: allowlisted but has no JSON.parse; remove the stale allowlist entry`)
  }

  if (problems.length > 0) fail(`ui-app JSON.parse allowlist violated:\n- ${problems.join('\n- ')}`)
  console.log('PASS: UI guardrails hold (JSON.parse confined to reviewed local-data sites; layering is enforced by TC-18).')
}

try {
  main()
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
}
