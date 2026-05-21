#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = process.cwd()
const SCAN_ROOTS = ['electron', 'src', 'infra', 'docs']
const INCLUDE_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.json',
  '.jsx',
  '.markdown',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.vue',
])

const IGNORED_DIR_NAMES = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'out',
  'release',
])

const MATCHERS = [
  { type: 'contentToken', regex: /\bcontentToken\b/iu },
  { type: 'fullHash', regex: /\bfullHash\b/iu },
  { type: 'absolutePath', regex: /\babsolutePath\b/u },
  { type: 'c_users_path', regex: /\b[A-Za-z]:(?:\\\\|\\)Users(?:\\\\|\\)/u },
  { type: 'starverse_path', regex: /\b[Dd]:(?:\\\\|\\)Starverse\b/u },
  { type: 'windows_drive_path', regex: /\b[A-Za-z]:(?:\\\\|\\)[^\s`'"<>)\]}]+/u },
]

const ALLOWLIST = [
  {
    id: 'sanitizer-redaction-implementations',
    reason: 'redaction implementations must name sensitive fields and path patterns',
    path: /^(electron\/ipc\/logSanitizer|src\/next\/file-type\/(externalEngineRegistry|externalProcessRunner|magikaAdapter|magikaClassifyRunner|magikaRuntimeLoader)|src\/next\/plugin-distribution\/sanitization)\.ts$/u,
    matchTypes: ['contentToken', 'fullHash'],
    line: /(replace|CONTENT_TOKEN|FULL_HASH|redact|sanitize)/iu,
  },
  {
    id: 'file-fingerprint-domain-fields',
    reason: 'domain schema and detector code store fullHash/fullHashStatus as structured fingerprint fields',
    path: /^(infra\/db\/types|infra\/files\/fileTypeDetectionService)\.ts$/u,
    matchTypes: ['fullHash'],
    line: /\b(fullHash|fullHashStatus|fingerprint|sha256)\b/u,
  },
  {
    id: 'managed-plugin-internal-path-validation',
    reason: 'Magika managed plugin validates internal plugin-root paths before use; these are not ordinary logs or renderer DTOs',
    path: /^src\/next\/file-type\/magikaManagedPlugin\.ts$/u,
    matchTypes: ['absolutePath'],
    line: /\b(absolutePath|runtimeEntryPath|modelFilePaths|configFilePaths|existsFile|realpath|statPath|readBytes|path\.resolve|path\.relative)\b/u,
  },
  {
    id: 'negative-privacy-assertions',
    reason: 'tests assert sensitive text is absent or redacted',
    path: /(^|\/)[^/]+\.(test|spec)\.ts$/u,
    line: /\bexpect\b.*\bnot\b|\btoBeUndefined\b|\bredacted\b|\bsanitized\b/iu,
  },
  {
    id: 'privacy-test-fixtures',
    reason: 'test fixtures inject representative paths, content tokens, or hashes to prove sanitization boundaries',
    path: /(^|\/)[^/]+\.(test|spec)\.ts$/u,
    line: /\b(new Error|mockRejectedValueOnce|throw|return|const|let|detail|failureReason|diagnostic|diagnostics|stderr|stdout|command|path|sourceRef|packageRef|installRef|stagingRef|rootRef|hostSelectedPath|runtimeEntry|fingerprint|fullHash|contentToken|sanitize|validate|normalize|writeText|basenameForLog|pandocSeed|ENCODER|signatureRef|ownedStagingRefs|ownedCleanupRefs|artifactInventoryRef|relativePath|pluginId|engineId|reason)\b|['"`].*[A-Za-z]:(?:\\\\|\\)/iu,
  },
  {
    id: 'privacy-test-names',
    reason: 'test names document privacy expectations',
    path: /(^|\/)[^/]+\.(test|spec)\.ts$/u,
    line: /\b(describe|it|test)\s*\(/u,
  },
  {
    id: 'file-pipeline-historical-docs',
    reason: 'file pipeline planning and audit documents intentionally quote historical privacy requirements and scan commands',
    path: /^docs\/file-pipeline\/file-type-detection-implementation\/.+\.(md|markdown)$/u,
  },
  {
    id: 'plugin-distribution-privacy-docs',
    reason: 'plugin distribution docs state privacy requirements rather than runtime log output',
    path: /^docs\/file-pipeline\/plugin-distribution\/.+\.(md|markdown)$/u,
    line: /\b(contentToken|fullHash|path|hash|signature|argv|raw)\b/iu,
  },
  {
    id: 'maintenance-privacy-docs',
    reason: 'maintenance docs describe privacy gates and reviewer checks',
    path: /^docs\/(AGENT_INDEX|maintenance\/privacy-scan-gate|maintenance\/opencode-agent-templates\/agents\/(flash|mimo)_doc_check)\.md$/u,
  },
  {
    id: 'historical-bugfix-docs',
    reason: 'bugfix and archive docs contain historical local path examples',
    path: /^docs\/(archive|bugfix)\/.+\.(md|markdown)$/u,
    matchTypes: ['c_users_path', 'starverse_path', 'windows_drive_path'],
  },
  {
    id: 'user-guide-windows-path-examples',
    reason: 'user guides show Windows path examples for local setup and cleanup',
    path: /^docs\/guides\/(TROUBLESHOOTING|DATA_CLEANUP_GUIDE|DEVELOPMENT_SETUP)\.md$/u,
    matchTypes: ['c_users_path', 'windows_drive_path'],
  },
  {
    id: 'format-conversion-progress-file-refs',
    reason: 'historical format-conversion progress document contains repo file references',
    path: /^docs\/file-pipeline\/format-conversion-preview-progress\.md$/u,
    matchTypes: ['starverse_path', 'windows_drive_path'],
  },
]

function toRepoPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function isAllowed(relPath, line, matchType) {
  for (const rule of ALLOWLIST) {
    if (!rule.path.test(relPath)) continue
    if (rule.matchTypes && !rule.matchTypes.includes(matchType)) continue
    if (rule.line && !rule.line.test(line)) continue
    return rule
  }
  return null
}

function lineExcerpt(line) {
  const compact = line.trim().replace(/\s+/gu, ' ')
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}

function scanText(relPath, text) {
  const allowed = []
  const violations = []
  const lines = text.split(/\r?\n/u)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const matcher of MATCHERS) {
      matcher.regex.lastIndex = 0
      if (!matcher.regex.test(line)) continue

      const allowRule = isAllowed(relPath, line, matcher.type)
      const hit = {
        file: relPath,
        line: index + 1,
        type: matcher.type,
        excerpt: lineExcerpt(line),
      }

      if (allowRule) {
        allowed.push({ ...hit, allowlistId: allowRule.id, reason: allowRule.reason })
      } else {
        violations.push({ ...hit, reason: 'unclassified privacy-sensitive match' })
      }
    }
  }

  return { allowed, violations }
}

function walkFiles(dirAbs, files) {
  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIR_NAMES.has(entry.name)) walkFiles(abs, files)
      continue
    }

    if (!entry.isFile()) continue
    const ext = path.extname(entry.name)
    if (INCLUDE_EXTENSIONS.has(ext)) files.push(abs)
  }
}

function collectFiles() {
  const files = []
  for (const root of SCAN_ROOTS) {
    walkFiles(path.join(REPO_ROOT, root), files)
  }
  return files
}

function scanRepo() {
  const files = collectFiles()
  const allowed = []
  const violations = []

  for (const fileAbs of files) {
    const relPath = toRepoPath(path.relative(REPO_ROOT, fileAbs))
    const text = fs.readFileSync(fileAbs, 'utf8')
    const result = scanText(relPath, text)
    allowed.push(...result.allowed)
    violations.push(...result.violations)
  }

  return { filesScanned: files.length, allowed, violations }
}

function summarizeAllowed(allowed) {
  const counts = new Map()
  for (const hit of allowed) {
    counts.set(hit.allowlistId, (counts.get(hit.allowlistId) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function printResult(result) {
  const allowedSummary = summarizeAllowed(result.allowed)
  console.log(`[privacy-scan] scanned files=${result.filesScanned}`)
  console.log(`[privacy-scan] allowed hits=${result.allowed.length}`)
  for (const [id, count] of allowedSummary) {
    const rule = ALLOWLIST.find((item) => item.id === id)
    console.log(`  - ${id}: ${count} (${rule?.reason ?? 'allowed'})`)
  }

  if (result.violations.length > 0) {
    console.error(`\n[privacy-scan] FAIL violations=${result.violations.length}`)
    for (const item of result.violations.slice(0, 100)) {
      console.error(`  - ${item.file}:${item.line} ${item.type} - ${item.reason}`)
      console.error(`    ${item.excerpt}`)
    }
    if (result.violations.length > 100) {
      console.error(`  ... ${result.violations.length - 100} more violations`)
    }
    process.exitCode = 1
    return
  }

  console.log('\n[privacy-scan] PASS no unclassified privacy-sensitive matches')
}

function assertSelfTest(name, condition) {
  if (!condition) throw new Error(`self-test failed: ${name}`)
}

function runSelfTest() {
  const unsafe = scanText(
    'src/example/leak.ts',
    "console.warn('failed C:\\\\Users\\\\alice\\\\secret.txt contentToken=tok fullHash=abc')\n",
  )
  assertSelfTest('unsafe production line is rejected', unsafe.violations.length >= 3)

  const sanitizer = scanText(
    'electron/ipc/logSanitizer.ts',
    ".replace(/(contentToken[\"'\\s:=]+)([^\\s\"',}]+)/gi, '$1[redacted-token]')\n",
  )
  assertSelfTest('sanitizer implementation is allowlisted', sanitizer.violations.length === 0)
  assertSelfTest('sanitizer implementation has allowed hit', sanitizer.allowed.length === 1)

  const fixture = scanText(
    'src/next/file-type/example.test.ts',
    "const error = new Error('failed at C:\\\\Users\\\\alice\\\\plugin contentToken=tok')\nexpect(String(error)).not.toContain('C:\\\\Users')\n",
  )
  assertSelfTest('privacy test fixture is allowlisted', fixture.violations.length === 0)

  const doc = scanText(
    'docs/random-note.md',
    'Do not paste D:\\Starverse\\secret.txt into logs.\n',
  )
  assertSelfTest('unclassified docs are still scanned', doc.violations.length > 0)

  console.log(`[privacy-scan] self-test PASS on ${os.platform()}`)
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  printResult(scanRepo())
}
