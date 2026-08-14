import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const relative = (file) => path.relative(root, file).replaceAll('\\', '/')
const failures = []

const entryDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/AGENT_INDEX.md',
  'docs/DOC_STATUS_INDEX.md',
  'docs/guides/INDEX.md',
  'docs/archive/README.md',
  'docs/maintenance/document-governance.md',
  'docs/maintenance/document-redirect-map.md',
]

function read(relativePath) {
  const absolute = path.resolve(root, relativePath)
  if (!existsSync(absolute)) {
    failures.push(`${relativePath} does not exist`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

function checkEntryLinks(relativePath, source) {
  const absolute = path.resolve(root, relativePath)
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/gu
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/gu, '')
    if (!rawTarget || rawTarget.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(rawTarget)) continue
    const target = rawTarget.split('#', 1)[0].split('?', 1)[0]
    if (!target) continue
    const resolved = path.resolve(path.dirname(absolute), target)
    if (!existsSync(resolved)) failures.push(`${relativePath} links to missing ${rawTarget}`)
  }
}

for (const entry of entryDocs) {
  const source = read(entry)
  if (!source) continue
  checkEntryLinks(entry, source)
}

const staleEntryTokens = [
  'docs/refactoring/REFACTOR_PROGRESS.md',
  '../refactoring/REFACTOR_PROGRESS.md',
]
for (const entry of entryDocs) {
  const source = readFileSync(path.resolve(root, entry), 'utf8')
  for (const token of staleEntryTokens) {
    if (source.includes(token)) failures.push(`${entry} contains stale path ${token}`)
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function addedDocs() {
  const base = process.env.DOCS_BASE_REF || process.env.GITHUB_BASE_SHA || 'HEAD^'
  const candidates = []
  try {
    candidates.push(...git(['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`]).split(/\r?\n/u))
  } catch {
    // A shallow checkout or an uncommitted-only worktree may not have a usable base.
  }
  try {
    candidates.push(...git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/u))
  } catch {
    // Keep the gate useful even when Git metadata is unavailable.
  }
  return [...new Set(candidates)].filter(
    (file) => file.startsWith('docs/') && file.endsWith('.md') && !file.startsWith('docs/archive/'),
  )
}

for (const file of addedDocs()) {
  const source = read(file).split(/\r?\n/u).slice(0, 30).join('\n')
  if (!/^\s*(?:[-*>]\s*)?\*?\*?(?:Status|Lifecycle Status)\*?\*?\s*:/imu.test(source)) failures.push(`${file} is missing Status metadata`)
  if (!/^\s*(?:[-*>]\s*)?\*?\*?Document Role\*?\*?\s*:/imu.test(source)) failures.push(`${file} is missing Document Role metadata`)
  if (!/^\s*(?:[-*>]\s*)?\*?\*?Last updated\*?\*?\s*:/imu.test(source)) failures.push(`${file} is missing Last updated metadata`)
}

if (failures.length > 0) {
  console.error('[docs-index] FAIL')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`[docs-index] PASS (${entryDocs.length} entry documents checked)`)
