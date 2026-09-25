#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = process.cwd()
const SCAN_ROOTS = ['electron', 'src', 'infra', 'docs', 'ops', 'artifacts', '.github', '.codex', '.gemini', 'scripts', 'tests']
const SCAN_FILES = ['README.md', 'README.zh-CN.md', 'AGENTS.md', '.cursorrules', '.windsurfrules']
const INCLUDE_EXTENSIONS = new Set([
  '.cjs',
  '.csv',
  '.js',
  '.json',
  '.jsx',
  '.markdown',
  '.md',
  '.mjs',
  '.log',
  '.sql',
  '.ts',
  '.tsx',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
  '.vue',
])

const MATCHERS = [
  { type: 'contentToken', regex: /\bcontentToken\b/iu },
  { type: 'fullHash', regex: /\bfullHash\b/iu },
  { type: 'absolutePath', regex: /\babsolutePath\b/u },
  { type: 'c_users_path', regex: /\b[A-Za-z]:(?:\\\\|\\)Users(?:\\\\|\\)/u },
  { type: 'starverse_path', regex: /\b[Dd]:(?:\\\\|\\)Starverse\b/u },
  { type: 'windows_drive_path', regex: /\b[A-Za-z]:(?:\\\\|\\)[^\s`'"<>)\]}]+/u },
]

const ARTIFACT_MATCHERS = [
  { type: 'artifact_email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { type: 'artifact_provider_credential', regex: /\b(?:sk-or-v1-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/iu },
  { type: 'artifact_private_key_marker', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
]

const AUTHORIZATION_HEADER_MATCHER = {
  type: 'authorization_header',
  regex: /authorization["']?\s*[:=]\s*["']?bearer\s+(?!\[redacted(?:[^\]]*)?\]|\[omitted\]|redacted\b|placeholder\b|<[^>]*(?:token|key|redact|placeholder)[^>]*>|\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*|(?:test|fake|dummy|example|sample)(?:[-_][A-Z0-9_]+)?\b|your[_-]?[A-Z0-9_]+\b)[^\s"',}]+/iu,
}

const ALLOWLIST = [
  {
    id: 'sanitizer-redaction-implementations',
    reason: 'redaction implementations must name sensitive fields and path patterns',
    path: /^(electron\/ipc\/logSanitizer|src\/next\/file-type\/(externalEngineRegistry|externalProcessRunner|magikaAdapter|magikaClassifyRunner|magikaRuntimeLoader)|src\/(next|shared)\/plugin-distribution\/sanitization)\.ts$/u,
    matchTypes: ['contentToken', 'fullHash'],
    line: /(replace|CONTENT_TOKEN|FULL_HASH|redact|sanitize)/iu,
  },
  {
    id: 'file-fingerprint-domain-fields',
    reason: 'domain schema and detector code store fullHash/fullHashStatus as structured fingerprint fields',
    path: /^infra\/db\/types\.ts$/u,
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
    id: 'dfc-sanitizer-input-and-denylists',
    reason: 'DFC sanitizer input contracts and private-field denylists must name fields that renderer DTOs strip',
    path: /^(src\/shared\/files\/documentFormatConversion|src\/next\/ipc\/contracts\/dbBridgeContracts|infra\/files\/(dfcConversionSandbox|electronConversionServiceContract))\.ts$/u,
    matchTypes: ['contentToken', 'fullHash'],
    line: /\b(contentToken|fullHash|FULL_HASH_RE|RENDERER_PRIVATE_META_KEYS|dfcAttachmentAuditSchema|DfcRendererAttachmentAuditInput)\b/u,
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
    id: 'dfc-privacy-boundary-docs',
    reason: 'DFC design and evidence docs intentionally name privacy-sensitive fields as forbidden renderer/log output',
    path: /^docs\/file-pipeline\/document-format-conversion\/.+\.(md|markdown)$/u,
    matchTypes: ['contentToken'],
    line: /\b(contentToken|privacy|DTO|renderer|logs?|omit|omits|expose|exposes|禁止|不记录|must not)\b/iu,
  },
  {
    id: 'dfc-historical-path-docs',
    reason: 'DFC historical and recovery documents contain local path examples as diagnostic evidence, not renderer output',
    path: /^docs\/file-pipeline\/document-format-conversion\/(archive\/.+|important-context|dfc-m17-html-to-pdf-browser-runtime-blocker|dfc-m29-libreoffice-production-package-policy)\.(md|markdown)$/u,
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
    path: /^(docs\/file-pipeline\/format-conversion-preview-progress|docs\/file-pipeline\/document-format-conversion\/archive\/v1\.0-superseded\/format-conversion-preview-progress)\.md$/u,
    matchTypes: ['starverse_path', 'windows_drive_path'],
  },
  {
    id: 'maintenance-workdir-docs',
    reason: 'maintenance audit command logs may name the repo workdir',
    path: /^docs\/maintenance\/code-health-audits\/.+\/commands\.md$/u,
    matchTypes: ['starverse_path', 'windows_drive_path'],
  },
  {
    id: 'synthetic-artifact-contact-placeholder',
    reason: 'invalid-domain contact placeholder preserves captured response shape without real contact data',
    path: /^artifacts\/.+/u,
    matchTypes: ['artifact_email'],
    line: /\bprivacy-placeholder@example\.invalid\b/iu,
  },
  {
    id: 'privacy-gate-detectors-and-synthetic-fixtures',
    reason: 'the gate must name sensitive field patterns and use synthetic values in its self-tests',
    path: /^scripts\/gates\/privacy-scan\.mjs$/u,
    line: /\b(contentToken|fullHash|absolutePath|scanText|assertSelfTest|privacy-placeholder@example\.invalid)\b|[CD]:\\\\/iu,
  },
  {
    id: 'official-runtime-packaging-input-paths',
    reason: 'packaging tools use absolute source paths transiently for file reads; package metadata records relative paths',
    path: /^scripts\/dev\/package-official-magika-v0(?:11|20)\.mjs$/u,
    matchTypes: ['absolutePath'],
  },
  {
    id: 'dfc-package-input-paths',
    reason: 'the package builder uses absolute local inputs transiently for size and hash calculation; emitted inventory uses relative paths',
    path: /^scripts\/dfc\/prepare-libreoffice-svpkg-dry-run\.mjs$/u,
    matchTypes: ['absolutePath'],
  },
  {
    id: 'dfc-smoke-privacy-assertions',
    reason: 'smoke checks contain synthetic path and sensitive-text detectors plus explicit redaction assertions',
    path: /^scripts\/dfc\/office-pdf-libreoffice-(?:live-installed-state|packaged-electron)-smoke\.mjs$/u,
    matchTypes: ['contentToken', 'absolutePath'],
    line: /(previewSensitive|PRIVATE KEY|contentToken|storageRef|redact|sanitize|file:\/\/|A-Za-z.*\\\\)/iu,
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

function scanText(relPath, text) {
  const allowed = []
  const violations = []
  const lines = text.split(/\r?\n/u)

  if (/^artifacts\/disk_audit_[^/]+\//u.test(relPath)) {
    violations.push({
      file: relPath,
      line: 1,
      type: 'raw_disk_audit_output',
      excerpt: 'generated local storage inventory',
      reason: 'raw disk-audit reports must remain local and ignored',
    })
  }

  if (/(^|\/)\.env(?:\..+)?$/u.test(relPath) && !/\.env\.(?:example|sample|template)$/u.test(relPath)) {
    violations.push({
      file: relPath,
      line: 1,
      type: 'private_environment_file',
      reason: 'private environment files must remain local and ignored',
    })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const isArtifact = relPath.startsWith('artifacts/')
    const isLogCapture = ['.log', '.txt'].includes(path.extname(relPath).toLowerCase())
      || relPath.startsWith('docs/archive/debug/')
    const matchers = isArtifact
      ? [...MATCHERS, ...ARTIFACT_MATCHERS, AUTHORIZATION_HEADER_MATCHER]
      : isLogCapture
        ? [...MATCHERS, AUTHORIZATION_HEADER_MATCHER]
        : MATCHERS
    for (const matcher of matchers) {
      matcher.regex.lastIndex = 0
      if (!matcher.regex.test(line)) continue

      const allowRule = isAllowed(relPath, line, matcher.type)
      const hit = {
        file: relPath,
        line: index + 1,
        type: matcher.type,
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

function collectFiles() {
  const files = []
  const candidatePaths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean)
  const rootPrefixes = SCAN_ROOTS.map((root) => root + '/')

  for (const relPath of candidatePaths) {
    const isPrivateEnvFile = /(^|\/)\.env(?:\..+)?$/u.test(relPath)
      && !/\.env\.(?:example|sample|template)$/u.test(relPath)
    const isLogCapture = ['.log', '.txt'].includes(path.extname(relPath).toLowerCase())
    if (!SCAN_FILES.includes(relPath) && !isPrivateEnvFile && !isLogCapture && !rootPrefixes.some((prefix) => relPath.startsWith(prefix))) {
      continue
    }

    const abs = path.join(REPO_ROOT, relPath)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue
    if (isPrivateEnvFile || isLogCapture || INCLUDE_EXTENSIONS.has(path.extname(relPath))) files.push(abs)
  }
  return files
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }

  let evenNulls = 0
  let oddNulls = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue
    if (index % 2 === 0) evenNulls += 1
    else oddNulls += 1
  }
  const nullRate = (evenNulls + oddNulls) / Math.max(buffer.length, 1)
  if (nullRate > 0.15) {
    return new TextDecoder(evenNulls > oddNulls ? 'utf-16be' : 'utf-16le').decode(buffer)
  }
  return new TextDecoder('utf-8').decode(buffer)
}

function scanRepo() {
  const files = collectFiles()
  const allowed = []
  const violations = []

  for (const fileAbs of files) {
    const relPath = toRepoPath(path.relative(REPO_ROOT, fileAbs))
    const text = decodeTextBuffer(fs.readFileSync(fileAbs))
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

  const artifact = scanText(
    'artifacts/openrouter/response.json',
    '{"contact":"person@example.test","Authorization":"Bearer sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n',
  )
  assertSelfTest('captured contact and credential values are rejected', artifact.violations.length >= 3)

  const syntheticArtifact = scanText(
    'artifacts/openrouter/response.json',
    '{"contact":"privacy-placeholder@example.invalid"}\n',
  )
  assertSelfTest('synthetic invalid-domain contact is allowlisted', syntheticArtifact.violations.length === 0)

  const rawDiskAudit = scanText(
    'artifacts/disk_audit_20260926/summary.json',
    '{"files":0}\n',
  )
  assertSelfTest('raw disk-audit output is rejected by path', rawDiskAudit.violations.some((item) => item.type === 'raw_disk_audit_output'))

  const privateEnv = scanText('.env.local', 'OPENAI_API_KEY=synthetic-placeholder\n')
  assertSelfTest('private environment files are rejected by path', privateEnv.violations.some((item) => item.type === 'private_environment_file'))

  const utf16Artifact = decodeTextBuffer(Buffer.from(
    '{"Authorization":"Bearer sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n',
    'utf16le',
  ))
  const decodedArtifact = scanText('artifacts/openrouter/response.txt', utf16Artifact)
  assertSelfTest('UTF-16 artifacts are decoded before privacy scanning', decodedArtifact.violations.some((item) => item.type === 'artifact_provider_credential'))

  const capturedAuth = scanText('docs/archive/debug/request-log.md', 'Authorization: Bearer sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n')
  assertSelfTest('committed debug logs reject bearer credentials', capturedAuth.violations.some((item) => item.type === 'authorization_header'))
  const redactedAuth = scanText('docs/archive/debug/request-log.md', 'Authorization: Bearer [redacted]\n')
  assertSelfTest('redacted bearer examples remain allowed', redactedAuth.violations.length === 0)

  console.log(`[privacy-scan] self-test PASS on ${os.platform()}`)
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  printResult(scanRepo())
}
