#!/usr/bin/env node
/**
 * check-sendplan-code-map.mjs — SendPlan issue code ↔ i18n mapping validation
 *
 * Extracts known SendPlan issue codes from:
 * - infra/files/sendPlanService.ts (production issue/reason code literals)
 * - infra/files/sendPlanService.test.ts (test assertions, secondary guard)
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

// Explicit production code inventory. The script verifies each entry still exists
// in sendPlanService.ts, then requires it in ISSUE_CODE_TO_I18N. Keep this list
// in sync whenever production SendPlan issue/reason code literals are added.
const KNOWN_PRODUCTION_CODES = [
  'advanced_file_type_detection_failed',
  'asset_record_missing',
  'asset_soft_deleted',
  'attachment_lineage_blocked',
  'attachment_parsing_incomplete',
  'audio_requires_local_file',
  'converted_text_hard_limit_exceeded',
  'conversion_required_before_send',
  'current_draft_incompatible_with_current_model',
  'deduped_to_current_draft',
  'draft_attachment_blocked',
  'duplicate_history_asset',
  'file_type_detection_failed',
  'file_type_detection_pending',
  'file_type_detection_required',
  'file_type_route_blocked',
  'history_attachment_blocked',
  'history_attachment_excluded',
  'incompatible_with_current_model',
  'missing_file_input_capability',
  'missing_mixed_input_capability',
  'missing_pdf_input_capability',
  'missing_text_input_capability',
  'no_send_mode_available',
  'no_sendable_representation',
  'pdf_not_supported_by_provider',
  'preview_only_asset_not_sendable',
  'preview_send_asset_mismatch',
  'dfc_selected_option_blocked',
  'derived_asset_ref_missing',
  'raw_file_ref_missing',
  'selected_option_blocked',
  'selected_option_failed',
  'selected_option_incompatible',
  'selected_option_missing',
  'selected_option_not_found',
  'selected_option_pending',
  'selected_option_stale',
  'selected_option_unavailable',
  'send_asset_not_ready',
  'send_asset_ref_kind_mismatch',
  'stale_derived_asset',
  'unsupported_attachment_payload',
  'unsupported_processing_status',
  'url_snapshot_failed',
  'url_snapshot_pending',
  'video_url_ref_not_allowed',
]

const KNOWN_UNMAPPED_PRODUCTION_CODES = [
  // Dynamic warning code family (`attachment_warning`, `attachment_warning_2`, ...)
  // uses the warning message path instead of ISSUE_CODE_TO_I18N mapping.
  'attachment_warning',
]

const PRODUCTION_NON_ISSUE_LITERALS = [
  'ask_user',
  'audio_in',
  'converted_csv',
  'converted_markdown',
  'converted_pdf',
  'converted_plain_text',
  'converted_tsv',
  'core_only',
  'core_plus_external',
  'core_plus_magika',
  'core_plus_parser',
  'derivative_asset_not_supported',
  'derived_asset',
  'derived_asset_deleted',
  'derived_asset_missing',
  'derived_asset_parent_mismatch',
  'derived_asset_preview_only',
  'derived_asset_source_hash_mismatch',
  'detection_failed',
  'detection_pending',
  'detection_required',
  'direct_audio',
  'direct_file',
  'direct_image',
  'direct_text',
  'direct_video',
  'engine_',
  'extracted_audio',
  'extracted_text',
  'file_attachment',
  'file_in',
  'image_in',
  'inline_base64',
  'local_fs',
  'manually_excluded',
  'materialization_failed',
  'native_file',
  'not_installed',
  'not_requested',
  'needs_user_selection',
  'original_file',
  'parser_validated',
  'partially_sendable',
  'pdf_attachment',
  'plain_text',
  'probe_failed',
  'preview_only',
  'ready_with_warnings',
  'remote_url',
  'rendered_images',
  'raw_file',
  'raw_file_ref_mismatch',
  'raw_file_source_hash_missing',
  'selected_frames',
  'selected_derived_asset_lineage_mismatch',
  'selected_derived_asset_source_hash_mismatch',
  'sendable_with_warnings',
  'table_markdown',
  'text_in',
  'text_in_prompt',
  'url_import',
  'link_and_file',
  'url_ref',
  'verdict_ready',
  'video_in',
]

function fail(msg) {
  console.error(`  FAIL: ${msg}`)
  failures++
}

function ok(msg) {
  console.log(`  OK: ${msg}`)
}

// ── Extract known codes ───────────────────────────────────

function readSendPlanService() {
  const serviceFile = join(ROOT, 'infra', 'files', 'sendPlanService.ts')
  try {
    return readFileSync(serviceFile, 'utf-8')
  } catch {
    console.warn('  WARN: Could not read sendPlanService.ts')
    return ''
  }
}

function extractCodesFromProductionService() {
  const content = readSendPlanService()
  if (!content) return []

  const codes = new Set()
  const knownCodeSet = new Set(KNOWN_PRODUCTION_CODES)
  const knownUnmappedSet = new Set(KNOWN_UNMAPPED_PRODUCTION_CODES)
  const knownNonIssueSet = new Set(PRODUCTION_NON_ISSUE_LITERALS)
  for (const code of KNOWN_PRODUCTION_CODES) {
    if (content.includes(`'${code}'`) || content.includes(`\`${code}`)) {
      codes.add(code)
    } else {
      fail(`known production code '${code}' not found in sendPlanService.ts; update KNOWN_PRODUCTION_CODES`)
    }
  }

  for (const code of KNOWN_UNMAPPED_PRODUCTION_CODES) {
    if (!(content.includes(`'${code}'`) || content.includes(`\`${code}`))) {
      fail(`known unmapped production code '${code}' not found in sendPlanService.ts; update KNOWN_UNMAPPED_PRODUCTION_CODES`)
    }
  }

  const literalMatches = content.matchAll(/['`]([a-z][a-z0-9_]+)['`]/g)
  const unexpectedLiterals = new Set()
  for (const match of literalMatches) {
    const literal = match[1]
    if (!literal.includes('_')) continue
    if (knownCodeSet.has(literal) || knownUnmappedSet.has(literal) || knownNonIssueSet.has(literal)) continue
    unexpectedLiterals.add(literal)
  }

  for (const literal of [...unexpectedLiterals].sort()) {
    fail(`unexpected production snake-case literal '${literal}' in sendPlanService.ts; classify it as mapped, unmapped, or non-issue`)
  }

  return [...codes].sort()
}

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
console.log('1. Extracting known issue codes from production service:')
const productionCodes = extractCodesFromProductionService()
console.log(`   Found ${productionCodes.length} production codes: ${productionCodes.join(', ')}`)

console.log('\n1b. Extracting secondary known issue codes from test file:')
const testCodes = extractCodesFromTestFile()
console.log(`   Found ${testCodes.length} test codes: ${testCodes.join(', ')}`)
const knownCodes = [...new Set([...productionCodes, ...testCodes])].sort()
console.log(`   Combined known codes: ${knownCodes.length}`)

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
