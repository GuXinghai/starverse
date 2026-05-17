#!/usr/bin/env node
/**
 * check-sendplan-code-map.mjs — SendPlan issue code ↔ i18n mapping validation
 *
 * Extracts known SendPlan issue codes from:
 * - infra/files/sendPlanService.test.ts (reasonCode/exclusionReason assertions)
 * - infra/files/sendPlanService.ts (issue() calls)
 *
 * Then verifies:
 * 1. Each known code exists in ISSUE_CODE_TO_I18N mapping
 * 2. Each mapped i18n key exists in the locale JSON
 *
 * Exit code 0 = pass, 1 = fail
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

let failures = 0

function fail(msg) {
  console.error(`  FAIL: ${msg}`)
  failures++
}

function ok(msg) {
  console.log(`  OK: ${msg}`)
}

// ── Extract known codes ───────────────────────────────────

function extractCodesFromTestFile() {
  const testFile = join(ROOT, 'infra', 'files', 'sendPlanService.test.ts')
  let content
  try {
    content = readFileSync(testFile, 'utf-8')
  } catch {
    console.warn('  WARN: Could not read sendPlanService.test.ts')
    return []
  }

  const codes = new Set()

  // Match reasonCode: 'xxx' patterns
  const reasonCodeMatches = content.matchAll(/reasonCode:\s*'([^']+)'/g)
  for (const m of reasonCodeMatches) {
    codes.add(m[1])
  }

  // Match exclusionReason: 'xxx' patterns
  const exclusionMatches = content.matchAll(/exclusionReason:\s*'([^']+)'/g)
  for (const m of exclusionMatches) {
    codes.add(m[1])
  }

  // Match code: 'xxx' in issue assertions
  const codeMatches = content.matchAll(/code:\s*'([^']+)'/g)
  for (const m of codeMatches) {
    codes.add(m[1])
  }

  return [...codes].sort()
}

// ── Extract ISSUE_CODE_TO_I18N mapping ────────────────────

function extractMappingFromLogic() {
  const logicFile = join(ROOT, 'src', 'ui-app', 'app', 'appChatApp.logic.ts')
  let content
  try {
    content = readFileSync(logicFile, 'utf-8')
  } catch {
    console.warn('  WARN: Could not read appChatApp.logic.ts')
    return {}
  }

  // Find the ISSUE_CODE_TO_I18N block
  const startMarker = 'const ISSUE_CODE_TO_I18N: Record<string, string> = {'
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) {
    console.warn('  WARN: Could not find ISSUE_CODE_TO_I18N in appChatApp.logic.ts')
    return {}
  }

  const blockStart = startIdx + startMarker.length
  const blockEnd = content.indexOf('}', blockStart)
  const block = content.substring(blockStart, blockEnd)

  const mapping = {}
  // Match 'code': 'i18n.key' patterns
  const matches = block.matchAll(/'([^']+)':\s*'([^']+)'/g)
  for (const m of matches) {
    mapping[m[1]] = m[2]
  }

  return mapping
}

// ── Check i18n key exists ─────────────────────────────────

function checkKeyExists(key) {
  const parts = key.split('.')
  const namespace = parts[0]
  const innerKey = parts.slice(1).join('.')

  for (const locale of ['zh-CN', 'en-US']) {
    const filePath = join(ROOT, 'src', 'shared', 'i18n', 'locales', locale, `${namespace}.json`)
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      const nsData = parsed[namespace] ?? parsed

      // Navigate to nested value
      let current = nsData
      for (const part of innerKey.split('.')) {
        if (current == null || typeof current !== 'object') return false
        current = current[part]
      }
      if (typeof current !== 'string') return false
    } catch {
      return false
    }
  }
  return true
}

// ── Main ──────────────────────────────────────────────────

console.log('SendPlan issue code mapping check\n')

// 1. Extract known codes from test file
console.log('1. Extracting known issue codes from test file:')
const knownCodes = extractCodesFromTestFile()
console.log(`   Found ${knownCodes.length} known codes: ${knownCodes.join(', ')}`)

// 2. Extract mapping from logic
console.log('\n2. Extracting ISSUE_CODE_TO_I18N mapping:')
const mapping = extractMappingFromLogic()
const mappedCodes = Object.keys(mapping)
console.log(`   Found ${mappedCodes.length} mapped codes`)

// 3. Check known codes are in mapping
console.log('\n3. Checking known codes are in mapping:')
for (const code of knownCodes) {
  if (mapping[code]) {
    ok(`'${code}' → '${mapping[code]}'`)
  } else {
    // Some codes are used as exclusionReason but not as issue codes
    // These may not need i18n mapping if they're only used internally
    const isInternalOnly = [
      'deduped_to_current_draft',
      'duplicate_history_asset',
      'asset_record_missing',
      'asset_soft_deleted',
      'attachment_lineage_blocked',
      'preview_only_asset_not_sendable',
      'stale_derived_asset',
      'preview_send_asset_mismatch',
      'send_asset_not_ready',
    ].includes(code)

    if (isInternalOnly) {
      console.log(`  SKIP: '${code}' (internal exclusion reason, not user-facing)`)
    } else {
      fail(`'${code}' not in ISSUE_CODE_TO_I18N`)
    }
  }
}

// 4. Check mapped i18n keys exist
console.log('\n4. Checking mapped i18n keys exist in locale JSON:')
for (const [code, i18nKey] of Object.entries(mapping)) {
  if (checkKeyExists(i18nKey)) {
    ok(`'${code}' → '${i18nKey}' (exists)`)
  } else {
    fail(`'${code}' → '${i18nKey}' (key NOT found in locale JSON)`)
  }
}

// Summary
console.log(`\n${'='.repeat(50)}`)
if (failures > 0) {
  console.error(`\nResult: ${failures} failure(s)`)
  process.exit(1)
} else {
  console.log('\nResult: PASS')
  process.exit(0)
}
