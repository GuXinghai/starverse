import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

const TARGETS = [
  { id: 'ui-next', dir: path.join(REPO_ROOT, 'src', 'ui-next') },
  { id: 'next', dir: path.join(REPO_ROOT, 'src', 'next') },
]

const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'release'])

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function fail(message) {
  const err = new Error(message)
  err.name = 'GateCheckFailure'
  throw err
}

function isIgnoredDirName(name) {
  return IGNORE_DIRS.has(name)
}

function walkFiles(dirAbs, out) {
  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      if (isIgnoredDirName(entry.name)) continue
      walkFiles(abs, out)
      continue
    }
    if (!entry.isFile()) continue

    const ext = path.extname(entry.name)
    if (INCLUDE_EXTS.has(ext)) out.push(abs)
  }
}

function toRel(absPath) {
  const rel = path.relative(REPO_ROOT, absPath)
  return rel.split(path.sep).join('/')
}

function buildLineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function indexToLineCol(lineStarts, index) {
  // 1-based line/col
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = lineStarts[mid]
    if (s <= index) lo = mid + 1
    else hi = mid - 1
  }
  const line = Math.max(1, hi + 1)
  const lineStart = lineStarts[hi] ?? 0
  const col = index - lineStart + 1
  return { line, col }
}

function extractImportSpecifiers(text) {
  const results = []

  const patterns = [
    // import ... from 'x' / export ... from 'x' (works across newlines)
    /\bimport\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    // side-effect import: import 'x'
    /\bimport\s*['"]([^'"]+)['"]/g,
    // dynamic import('x')
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // require('x')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const re of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const spec = m[1]
      if (!spec) continue
      const specIdx = m.index + m[0].lastIndexOf(spec)
      results.push({ spec, index: specIdx })
    }
  }

  return results
}

function checkUiNextSpecifier(spec) {
  const legacyRoot = /^@\/(stores|services|components|composables|utils|types)(\/|$)/
  if (legacyRoot.test(spec)) {
    return 'ui-next must not import legacy surfaces (@/stores|@/services|@/components|@/composables|@/utils|@/types)'
  }

  // Only block upward relative imports (../...) into legacy surfaces; allow local ui-next folders like ./components.
  const relativeLegacyRoot = /^\.\.(?:\/\.\.)*\/(stores|services|components|composables|utils|types)(\/|$)/
  if (relativeLegacyRoot.test(spec)) {
    return 'ui-next must not reach legacy surfaces via relative imports (../stores|../services|...)'
  }

  const archived = /^(?:\.{1,2}\/)+archived-(components|services)(\/|$)/
  if (archived.test(spec)) {
    return 'ui-next must not import archived legacy code (archived-components/archived-services)'
  }

  // Extra safety: block explicit "src/components/..." style specifiers.
  if (spec.includes('src/components') || spec.includes('src/stores') || spec.includes('src/services')) {
    return 'ui-next must not import legacy src/components|src/stores|src/services by path'
  }

  return null
}

function checkNextSpecifier(spec) {
  const uiLayer = /^@\/(ui-next|ui-kit)(\/|$)/
  if (uiLayer.test(spec)) {
    return 'src/next/** must not import ui-next/ui-kit'
  }

  if (spec.endsWith('.vue') || spec.includes('.vue?')) {
    return 'src/next/** must not import .vue modules'
  }

  return null
}

function scanTarget(target) {
  if (!fs.existsSync(target.dir)) fail(`Missing directory: ${toRel(target.dir)}`)

  const files = []
  walkFiles(target.dir, files)

  const violations = []

  for (const fileAbs of files) {
    const rel = toRel(fileAbs)
    const text = fs.readFileSync(fileAbs, 'utf8')
    const lineStarts = buildLineStarts(text)

    for (const { spec, index } of extractImportSpecifiers(text)) {
      const reason = target.id === 'ui-next' ? checkUiNextSpecifier(spec) : checkNextSpecifier(spec)
      if (!reason) continue

      const loc = indexToLineCol(lineStarts, index)
      const lineText = (text.split(/\r?\n/g)[loc.line - 1] ?? '').trim()
      violations.push({ file: rel, line: loc.line, col: loc.col, spec, reason, lineText })
    }
  }

  return { filesScanned: files.length, violations }
}

function main() {
  section('TC-13 — UI isolation gate (ui-next <-> legacy, next <-> UI)')

  const allViolations = []

  for (const target of TARGETS) {
    section(`Scan: ${target.id} (${toRel(target.dir)})`)
    const result = scanTarget(target)
    console.log(`Files scanned: ${result.filesScanned}`)
    allViolations.push(...result.violations)
  }

  if (allViolations.length > 0) {
    console.error(`\n[FAIL] Found ${allViolations.length} forbidden imports:`)
    for (const v of allViolations.slice(0, 50)) {
      console.error(`- ${v.file}:${v.line}:${v.col} import "${v.spec}"`)
      console.error(`  reason: ${v.reason}`)
      console.error(`  line: ${v.lineText}`)
    }
    if (allViolations.length > 50) console.error(`... ${allViolations.length - 50} more`)
    process.exit(1)
  }

  console.log('\n[PASS] No forbidden imports found.')
}

try {
  main()
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
}
