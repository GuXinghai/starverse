#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = process.cwd()

const SCAN_DIRS = ['src', 'electron', 'infra', 'tests']
const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.d.ts'])

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-electron',
  'release',
  'public',
  'docs',
  'archived-components',
  'archived-services',
])

function isIgnoredDirName(name) {
  return IGNORE_DIR_NAMES.has(name)
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

    const ext = entry.name.endsWith('.d.ts') ? '.d.ts' : path.extname(entry.name)
    if (INCLUDE_EXTS.has(ext)) {
      out.push(abs)
    }
  }
}

function collectFiles() {
  const files = []
  for (const rel of SCAN_DIRS) {
    const abs = path.join(REPO_ROOT, rel)
    walkFiles(abs, files)
  }
  return files
}

function fileExistsByNameRecursively(targetFileName) {
  // quick check: walk only once over scan dirs; still cheap at this repo size
  const files = collectFiles()
  return files.some(f => path.basename(f) === targetFileName)
}

function buildCommentRangesJsLike(text) {
  // Returns sorted, non-overlapping ranges [{ start, end }] (end exclusive)
  // Lexes JS/TS-like comments with string awareness to avoid treating "https://" as a comment.
  const ranges = []

  let i = 0
  const n = text.length

  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false
  let escape = false

  let currentCommentStart = -1

  function pushRange(start, end) {
    if (start >= 0 && end > start) ranges.push({ start, end })
  }

  while (i < n) {
    const ch = text[i]
    const next = i + 1 < n ? text[i + 1] : ''

    if (inLineComment) {
      if (ch === '\n') {
        pushRange(currentCommentStart, i)
        inLineComment = false
        currentCommentStart = -1
      }
      i += 1
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        pushRange(currentCommentStart, i + 2)
        inBlockComment = false
        currentCommentStart = -1
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (escape) {
      escape = false
      i += 1
      continue
    }

    if (inSingle) {
      if (ch === '\\') escape = true
      else if (ch === "'") inSingle = false
      i += 1
      continue
    }

    if (inDouble) {
      if (ch === '\\') escape = true
      else if (ch === '"') inDouble = false
      i += 1
      continue
    }

    if (inTemplate) {
      if (ch === '\\') {
        escape = true
        i += 1
        continue
      }
      if (ch === '`') {
        inTemplate = false
        i += 1
        continue
      }
      // NOTE: we intentionally do not try to parse ${...} expressions here.
      i += 1
      continue
    }

    // Not in string/comment
    if (ch === "'") {
      inSingle = true
      i += 1
      continue
    }
    if (ch === '"') {
      inDouble = true
      i += 1
      continue
    }
    if (ch === '`') {
      inTemplate = true
      i += 1
      continue
    }

    // JS/TS comments
    if (ch === '/' && next === '/') {
      inLineComment = true
      currentCommentStart = i
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      currentCommentStart = i
      i += 2
      continue
    }

    i += 1
  }

  if (inLineComment && currentCommentStart >= 0) {
    pushRange(currentCommentStart, n)
  }

  // Add HTML comment ranges for Vue templates (<!-- -->)
  // This is a best-effort pass; it doesn't try to be context-aware.
  let htmlIdx = 0
  while (true) {
    const start = text.indexOf('<!--', htmlIdx)
    if (start === -1) break
    const end = text.indexOf('-->', start + 4)
    if (end === -1) {
      pushRange(start, n)
      break
    }
    pushRange(start, end + 3)
    htmlIdx = end + 3
  }

  ranges.sort((a, b) => a.start - b.start)

  // merge overlaps
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (!last || r.start > last.end) {
      merged.push({ ...r })
    } else {
      last.end = Math.max(last.end, r.end)
    }
  }

  return merged
}

function isIndexInRanges(index, ranges) {
  // ranges sorted
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = ranges[mid]
    if (index < r.start) hi = mid - 1
    else if (index >= r.end) lo = mid + 1
    else return true
  }
  return false
}

function getLineAndCol(text, index) {
  // 1-based line, 1-based col
  let line = 1
  let col = 1
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }
  return { line, col }
}

const RULES = [
  {
    id: 'getModelParameters',
    description: 'Legacy symbol: getModelParameters',
    regex: /\bgetModelParameters\b/g,
    commentOk: true,
  },
  {
    id: 'openrouter_parameters_v1',
    description: 'Legacy endpoint: /api/v1/parameters',
    regex: /\/api\/v1\/parameters\b/g,
    commentOk: true,
  },
  {
    id: 'openrouter_parameters_legacy',
    description: 'Legacy endpoint: /parameters/ (deprecated)',
    regex: /\/parameters\//g,
    commentOk: true,
  },
  {
    id: 'buildModelCapability',
    description: 'Revival-risk name: buildModelCapability*',
    regex: /\bbuildModelCapability(Map)?\b/g,
    commentOk: false,
  },
]

function scanFile(fileAbs) {
  const rel = path.relative(REPO_ROOT, fileAbs)
  const text = fs.readFileSync(fileAbs, 'utf8')

  const isDts = rel.endsWith('.d.ts')
  const commentRanges = isDts ? [] : buildCommentRangesJsLike(text)

  const warnings = []
  const errors = []

  for (const rule of RULES) {
    rule.regex.lastIndex = 0
    let m
    while ((m = rule.regex.exec(text)) !== null) {
      const idx = m.index
      const inComment = !isDts && isIndexInRanges(idx, commentRanges)
      const loc = getLineAndCol(text, idx)
      const item = {
        ruleId: rule.id,
        file: rel,
        line: loc.line,
        col: loc.col,
        excerpt: m[0],
        inComment,
      }

      if (rule.commentOk && inComment) warnings.push(item)
      else errors.push(item)
    }
  }

  return { rel, warnings, errors }
}

function readBaselineCount() {
  const baselineFile = path.join(REPO_ROOT, 'docs', 'B_REFACTOR_BASELINE.md')
  if (!fs.existsSync(baselineFile)) return null

  const content = fs.readFileSync(baselineFile, 'utf8')
  const m = content.match(/\bbaseline_error_count\s*:\s*(\d+)\b/)
  if (!m) return null
  return Number(m[1])
}

function runVueTscCountErrors() {
  const proc = spawnSync('npx', ['vue-tsc', '--noEmit'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  const output = `${proc.stdout || ''}${proc.stderr || ''}`
  const matches = output.match(/error TS\d+/g)
  const count = matches ? matches.length : 0

  return { exitCode: proc.status ?? 0, count, output }
}

function main() {
  const errors = []
  const warnings = []

  // 1) High-risk type revival source
  const hasLegacyDts = fileExistsByNameRecursively('openrouter-service.d.ts')
  if (hasLegacyDts) {
    errors.push({ ruleId: 'openrouter-service.d.ts', file: '.', line: 1, col: 1, excerpt: 'openrouter-service.d.ts', inComment: false })
  }

  // 2) Pattern scan
  const files = collectFiles()
  for (const f of files) {
    const result = scanFile(f)
    warnings.push(...result.warnings)
    errors.push(...result.errors)
  }

  // 3) TS baseline gate
  const baseline = readBaselineCount()
  if (baseline == null || !Number.isFinite(baseline)) {
    errors.push({ ruleId: 'ts_baseline', file: 'docs/B_REFACTOR_BASELINE.md', line: 1, col: 1, excerpt: 'missing baseline_error_count', inComment: false })
  } else {
    const tsc = runVueTscCountErrors()
    if (tsc.count > baseline) {
      errors.push({ ruleId: 'ts_baseline', file: '.', line: 1, col: 1, excerpt: `TS errors increased: current=${tsc.count} baseline=${baseline}`, inComment: false })
    }
    // Always print summary
    console.log(`[TS_BASELINE] baseline=${baseline} current=${tsc.count}`)
  }

  // Output
  const warnCount = warnings.length
  const errCount = errors.length

  if (warnCount > 0) {
    console.log(`\n[WARN] ${warnCount} comment-only matches (allowed, but keep an eye on them):`)
    for (const w of warnings.slice(0, 25)) {
      console.log(`  - ${w.ruleId}: ${w.file}:${w.line}:${w.col} (${w.excerpt})`)
    }
    if (warnCount > 25) console.log(`  ... ${warnCount - 25} more warnings`) 
  }

  if (errCount > 0) {
    console.log(`\n[FAIL] ${errCount} violations:`)
    for (const e of errors.slice(0, 50)) {
      console.log(`  - ${e.ruleId}: ${e.file}:${e.line}:${e.col} (${e.excerpt})${e.inComment ? ' [comment]' : ''}`)
    }
    if (errCount > 50) console.log(`  ... ${errCount - 50} more errors`)
    process.exit(1)
  }

  console.log(`\n[PASS] Gate clean. warnings=${warnCount} errors=${errCount}`)
}

main()
