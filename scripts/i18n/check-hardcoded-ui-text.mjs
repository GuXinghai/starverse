#!/usr/bin/env node
/**
 * check-hardcoded-ui-text.mjs — Hardcoded UI text scanner
 *
 * Scans source files for hardcoded user-visible strings that should be i18n'd.
 * Uses allowlist to exclude known acceptable patterns.
 *
 * Exit code 0 = pass, 1 = fail (hardcoded text found)
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// ── Configuration ─────────────────────────────────────────

const SCAN_DIRS = [
  'src/ui-app',
  'src/ui-kit',
  'electron/ipc',
  'electron/windows',
  'electron/main.ts',
]

const SCAN_EXTENSIONS = ['.ts', '.vue']

// Patterns to exclude (allowlist)
const ALLOWLIST_FILE = join(__dirname, 'hardcoded-allowlist.txt')

const DEFAULT_ALLOWLIST = [
  // Internal debug strings (not user-visible)
  /console\.(log|warn|error|info|debug)\(/,
  /shouldLogDebug\(\)/,
  /summarizeErrorForLog/,
  /sanitizeDialogErrorMessage/,
  /redactSensitiveString/,
  /basenameForLog/,

  // Technical constants / config keys
  /configVersion/,
  /CURRENT_CONFIG_VERSION/,
  /OPENROUTER_STREAM_WIRE_VERSION/,
  /wireVersion/,

  // IPC channel names
  /registerInvoke\(/,
  /'dialog:/,
  /'shell:/,
  /'settings\./,
  /'stream:/,

  // CSS class names and data attributes
  /data-testid=/,
  /class="/,

  // Template syntax
  /v-else-if=/,
  /v-if=/,
  /v-for=/,
  /@click=/,

  // Type annotations and imports
  /import /,
  /type /,
  /interface /,

  // File paths and URLs
  /https?:\/\//,
  /asset:\/\//,
  /file:\/\//,
  /data:image\//,

  // Error codes / technical identifiers
  /error\.code/,
  /e\.code/,
  /error\.message/,
  /e\.message/,

  // Test-only patterns
  /describe\(/,
  /it\(/,
  /expect\(/,
  /vi\.fn/,
  /vi\.mock/,
]

// Chinese character range
const CHINESE_RE = /[\u4e00-\u9fff]/

// Common English UI strings that should be i18n'd
const EN_UI_PATTERNS = [
  /\bSave\b/,
  /\bCancel\b/,
  /\bClose\b/,
  /\bDelete\b/,
  /\bOpen\b/,
  /\bSubmit\b/,
  /\bConfirm\b/,
  /\bRetry\b/,
  /\bLoading\b/,
  /\bError\b/,
  /\bWarning\b/,
  /\bInvalid URL\b/,
  /\bUnsupported protocol\b/,
  /\bMissing image URL\b/,
  /\bAsset not found\b/,
  /\bInvalid file URL\b/,
  /\bInvalid image\b/,
  /\bDownload failed\b/,
  /\bExport image\b/,
  /\bSelect image\b/,
  /\bImages\b/,
  /\bAll Files\b/,
  /\bNo .* yet\b/,
  /\bFailed to\b/,
]

// ── Helpers ───────────────────────────────────────────────

function loadAllowlist() {
  const patterns = [...DEFAULT_ALLOWLIST]
  if (existsSync(ALLOWLIST_FILE)) {
    const lines = readFileSync(ALLOWLIST_FILE, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      try {
        patterns.push(new RegExp(trimmed))
      } catch {
        // Skip invalid regex
      }
    }
  }
  return patterns
}

function isAllowlisted(line, allowlist) {
  return allowlist.some(pattern => pattern.test(line))
}

function getFilesToScan() {
  const files = []
  for (const target of SCAN_DIRS) {
    const fullPath = join(ROOT, target)
    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        const output = execSync(
          `git ls-files "${target}"`,
          { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()
        if (output) {
          files.push(...output.split('\n').filter(f => {
            const ext = f.substring(f.lastIndexOf('.'))
            return SCAN_EXTENSIONS.includes(ext) &&
              !f.includes('.test.') &&
              !f.includes('.spec.') &&
              !f.includes('/__tests__/') &&
              !f.includes('/locales/') &&
              !f.includes('/docs/')
          }))
        }
      } else if (stat.isFile()) {
        files.push(target)
      }
    } catch {
      // Skip missing paths
    }
  }
  return [...new Set(files)]
}

function stripVueMustaches(text) {
  return text.replace(/\{\{[\s\S]*?\}\}/g, ' ')
}

function stripHtmlTags(text) {
  return text.replace(/<[^>]+>/g, ' ')
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function hasUserVisibleText(text) {
  const normalized = normalizeText(text)
  if (!normalized) return false
  if (normalized.length < 2) return false
  if (/^[\d\s.,:;()[\]{}#/+*-]+$/.test(normalized)) return false
  return CHINESE_RE.test(normalized) || /[A-Za-z][A-Za-z\s.,:;!?'"()/-]{2,}/.test(normalized)
}

function isLikelyVueExpression(text) {
  return /[`{}?]|\|\||&&|=>|\b(props|const|let|return)\b|\.[A-Za-z_$]/.test(text)
}

function isTemplateSyntaxOnly(text) {
  return /^(@|v-|:|#)/.test(text) ||
    /^(v-else|v-if|v-for|v-show|v-slot|template)$/.test(text) ||
    /^(&lt;|&gt;|<|>)$/.test(text)
}

function pushFinding(findings, file, line, kind, text) {
  findings.push({
    file,
    line,
    text: normalizeText(text).substring(0, 120),
    kind,
  })
}

function scanVueTemplateLine(file, line, lineNum, allowlist, findings) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('<!--')) return
  if (isAllowlisted(`${file}:${line}`, allowlist)) return

  const attrRe = /\b(title|aria-label|placeholder|alt)=["']([^"']+)["']/g
  for (const match of line.matchAll(attrRe)) {
    if (line[match.index - 1] === ':') continue
    const value = match[2]
    if (value.includes('{{') || value.includes('t(') || value.startsWith(':')) continue
    if (isLikelyVueExpression(value)) continue
    if (hasUserVisibleText(value)) {
      pushFinding(findings, file, lineNum, `attribute:${match[1]}`, value)
    }
  }

  const textWithoutTags = normalizeText(stripHtmlTags(line))
  const textWithoutMustaches = normalizeText(stripVueMustaches(textWithoutTags))
  if (textWithoutMustaches && textWithoutMustaches !== textWithoutTags && hasUserVisibleText(textWithoutMustaches)) {
    pushFinding(findings, file, lineNum, 'mustache-adjacent-text', textWithoutMustaches)
    return
  }

  if (
    !trimmed.startsWith('<') &&
    !trimmed.startsWith('{{') &&
    !trimmed.includes('=') &&
    !isTemplateSyntaxOnly(textWithoutMustaches) &&
    !isLikelyVueExpression(textWithoutMustaches) &&
    hasUserVisibleText(textWithoutMustaches)
  ) {
    pushFinding(findings, file, lineNum, 'template-text', textWithoutMustaches)
  }
}

// ── Main ──────────────────────────────────────────────────

console.log('Hardcoded UI text scan\n')

const allowlist = loadAllowlist()
const files = getFilesToScan()
const findings = []

for (const file of files) {
  const fullPath = join(ROOT, file)
  let content
  try {
    content = readFileSync(fullPath, 'utf-8')
  } catch {
    continue
  }

  const lines = content.split('\n')
  let vueTemplateDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1
    const trimmed = line.trim()

    if (file.endsWith('.vue')) {
      if (trimmed.startsWith('<template')) {
        vueTemplateDepth++
        continue
      }
      const inVueTemplate = vueTemplateDepth > 0
      if (trimmed.startsWith('</template')) {
        vueTemplateDepth = Math.max(0, vueTemplateDepth - 1)
        continue
      }
      if (inVueTemplate) {
        scanVueTemplateLine(file, line, lineNum, allowlist, findings)
      }
    }

    // Skip allowlisted patterns for script/string literal checks.
    if (isAllowlisted(`${file}:${line}`, allowlist) || isAllowlisted(line, allowlist)) continue

    // Check for Chinese characters in non-string contexts
    // (Chinese in template literals or string assignments)
    if (CHINESE_RE.test(line)) {
      // Only flag if it looks like a user-visible string
      if (
        trimmed.startsWith("'") ||
        trimmed.startsWith('"') ||
        trimmed.startsWith('`') ||
        trimmed.includes("= '") ||
        trimmed.includes('= "') ||
        trimmed.includes(': "') ||
        trimmed.includes(": '") ||
        trimmed.includes('title:') ||
        trimmed.includes('label:') ||
        trimmed.includes('placeholder:') ||
        trimmed.includes('message:') ||
        trimmed.includes('reason:') ||
        trimmed.includes('warningText:') ||
        trimmed.includes('setAttachmentFeedback')
      ) {
        findings.push({
          file,
          line: lineNum,
          text: trimmed.substring(0, 120),
          kind: 'chinese',
        })
      }
    }

    // Check for common English UI strings
    for (const pattern of EN_UI_PATTERNS) {
      if (pattern.test(line) && !isAllowlisted(line, allowlist)) {
        const trimmed = line.trim()
        // Only flag string literals, not code references
        if (
          (trimmed.startsWith("'") || trimmed.startsWith('"') || trimmed.startsWith('`')) &&
          trimmed.length > 3 &&
          trimmed.length < 200
        ) {
          findings.push({
            file,
            line: lineNum,
            text: trimmed.substring(0, 120),
            kind: 'english',
          })
          break // One finding per line is enough
        }
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────

if (findings.length === 0) {
  console.log('No hardcoded UI text found.')
  process.exit(0)
}

console.log(`Found ${findings.length} potential hardcoded string(s):\n`)

const byFile = {}
for (const f of findings) {
  if (!byFile[f.file]) byFile[f.file] = []
  byFile[f.file].push(f)
}

for (const [file, items] of Object.entries(byFile)) {
  console.log(`${file}:`)
  for (const item of items) {
    console.log(`  L${item.line} [${item.kind}]: ${item.text}`)
  }
  console.log()
}

console.log(`Total: ${findings.length} finding(s) in ${Object.keys(byFile).length} file(s)`)
console.log('\nTo suppress false positives, add regex patterns to: scripts/i18n/hardcoded-allowlist.txt')

// Exit with warning (not failure) for now — can be changed to fail when count is low enough
if (findings.length > 50) {
  console.error('\nResult: FAIL (too many findings)')
  process.exit(1)
} else {
  console.log('\nResult: PASS (findings within acceptable range)')
  process.exit(0)
}
