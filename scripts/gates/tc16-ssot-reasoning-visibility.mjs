import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

const SSOT_FILE = path.join(REPO_ROOT, 'docs', 'open_router_流式回复与推理_ssot（v_2_）.md')
const GUIDES_DIR = path.join(REPO_ROOT, 'docs', 'guides')
const SRC_DIR = path.join(REPO_ROOT, 'src')

const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.md'])
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

function scanText(text, patterns) {
  const lineStarts = buildLineStarts(text)
  const lines = text.split(/\r?\n/g)
  const matches = []

  for (const p of patterns) {
    p.regex.lastIndex = 0
    let m
    while ((m = p.regex.exec(text)) !== null) {
      const idx = m.index
      const loc = indexToLineCol(lineStarts, idx)
      const lineText = (lines[loc.line - 1] ?? '').trim()
      matches.push({ ...loc, patternId: p.id, reason: p.reason, lineText })
    }
  }

  return matches
}

function main() {
  section('TC-16 — SSOT reasoning visibility + panelState contract (no hidden)')

  if (!fs.existsSync(SSOT_FILE)) fail(`Missing SSOT file: ${toRel(SSOT_FILE)}`)

  section(`Scan SSOT: ${toRel(SSOT_FILE)}`)
  const ssotText = fs.readFileSync(SSOT_FILE, 'utf8')

  const ssotForbidden = [
    {
      id: 'ssot_visibility_hidden_union',
      regex: /visibility:\s*'shown'\s*\|\s*'hidden'\s*\|\s*'not_returned'/g,
      reason: 'SSOT must not define visibility with hidden',
    },
    {
      id: 'ssot_visibility_hidden_union_compact',
      regex: /visibility:\s*'shown'\|'hidden'\|'not_returned'/g,
      reason: 'SSOT must not define visibility with hidden (compact form)',
    },
    {
      id: 'ssot_tristate_list_hidden',
      regex: /\bshown\s*\/\s*hidden\s*\/\s*not_returned\b/g,
      reason: 'SSOT must not describe tri-state as shown/hidden/not_returned',
    },
  ]

  const ssotViolations = scanText(ssotText, ssotForbidden).map((m) => ({
    file: toRel(SSOT_FILE),
    ...m,
  }))

  const ssotRequired = [
    /visibility:\s*'shown'\s*\|\s*'excluded'\s*\|\s*'not_returned'/,
    /panelState:\s*'collapsed'\s*\|\s*'expanded'/,
  ]

  const missingRequired = ssotRequired.filter((re) => !re.test(ssotText))

  if (ssotViolations.length > 0 || missingRequired.length > 0) {
    if (ssotViolations.length > 0) {
      console.error(`\n[FAIL] Found forbidden SSOT contract fragments:`)
      for (const v of ssotViolations.slice(0, 50)) {
        console.error(`- ${v.file}:${v.line}:${v.col} (${v.patternId})`)
        console.error(`  reason: ${v.reason}`)
        console.error(`  line: ${v.lineText}`)
      }
      if (ssotViolations.length > 50) console.error(`... ${ssotViolations.length - 50} more`)
    }

    if (missingRequired.length > 0) {
      console.error(`\n[FAIL] SSOT missing required contract fragments:`)
      for (const re of missingRequired) {
        console.error(`- missing pattern: ${String(re)}`)
      }
    }

    process.exit(1)
  }

  section(`Scan code: ${toRel(SRC_DIR)}`)
  const codeFiles = []
  walkFiles(SRC_DIR, codeFiles)
  console.log(`Files scanned: ${codeFiles.length}`)

  const codeForbidden = [
    {
      id: 'code_reasoning_visibility_union_hidden',
      regex: /\bReasoningViewVisibility\b[^\n]*['"]hidden['"]/g,
      reason: 'ReasoningViewVisibility must not include hidden',
    },
    {
      id: 'code_reasoning_view_visibility_check_hidden',
      regex: /\breasoningView\s*\.\s*visibility\s*===\s*['"]hidden['"]/g,
      reason: 'UI/state code must not branch on visibility === \"hidden\"',
    },
  ]

  const codeViolations = []
  for (const abs of codeFiles) {
    const rel = toRel(abs)
    const text = fs.readFileSync(abs, 'utf8')
    const matches = scanText(text, codeForbidden)
    for (const m of matches) codeViolations.push({ file: rel, ...m })
  }

  if (codeViolations.length > 0) {
    console.error(`\n[FAIL] Found forbidden code references to visibility=hidden:`)
    for (const v of codeViolations.slice(0, 50)) {
      console.error(`- ${v.file}:${v.line}:${v.col} (${v.patternId})`)
      console.error(`  reason: ${v.reason}`)
      console.error(`  line: ${v.lineText}`)
    }
    if (codeViolations.length > 50) console.error(`... ${codeViolations.length - 50} more`)
    process.exit(1)
  }

  // Extend scan to docs/guides/** to prevent "visibility hidden" contract resurrection
  if (fs.existsSync(GUIDES_DIR)) {
    section(`Scan guides: ${toRel(GUIDES_DIR)}`)
    const guideFiles = []
    walkFiles(GUIDES_DIR, guideFiles)
    const mdFiles = guideFiles.filter((abs) => path.extname(abs) === '.md')
    console.log(`Files scanned: ${mdFiles.length}`)

    const guideForbidden = [
      {
        id: 'guide_visibility_visible_hidden_union',
        regex: /visibility\??:\s*'visible'\s*\|\s*'hidden'/g,
        reason: 'Guides must not define visibility as visible/hidden',
      },
      {
        id: 'guide_visibility_hidden_equality',
        regex: /\bvisibility\b\s*(?:===|!==)\s*'hidden'/g,
        reason: 'Guides must not branch on visibility ===/!== hidden',
      },
      {
        id: 'guide_enabled_hidden_type',
        regex: /\benabled:hidden\b/g,
        reason: 'Guides must not reference legacy enabled:hidden encoding',
      },
      {
        id: 'guide_enabled_visible_type',
        regex: /\benabled:visible\b/g,
        reason: 'Guides must not reference legacy enabled:visible encoding',
      },
      {
        id: 'guide_visibility_hidden_quoted_label',
        regex: /\bVisibility\s*\"hidden\"\b/g,
        reason: 'Guides must not describe a visibility="hidden" mode',
      },
    ]

    const guideViolations = []
    for (const abs of mdFiles) {
      const rel = toRel(abs)
      const text = fs.readFileSync(abs, 'utf8')
      const matches = scanText(text, guideForbidden)
      for (const m of matches) guideViolations.push({ file: rel, ...m })
    }

    if (guideViolations.length > 0) {
      console.error(`\n[FAIL] Found forbidden guide fragments (visibility hidden legacy):`)
      for (const v of guideViolations.slice(0, 50)) {
        console.error(`- ${v.file}:${v.line}:${v.col} (${v.patternId})`)
        console.error(`  reason: ${v.reason}`)
        console.error(`  line: ${v.lineText}`)
      }
      if (guideViolations.length > 50) console.error(`... ${guideViolations.length - 50} more`)
      process.exit(1)
    }
  }

  console.log('\n[PASS] SSOT uses excluded contract and no hidden leakage found.')
}

try {
  main()
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
}
