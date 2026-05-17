#!/usr/bin/env node
/**
 * check-i18n-coverage.mjs — i18n key coverage gate
 *
 * Checks:
 * 1. zh-CN and en-US have identical namespace sets
 * 2. Each namespace has identical key sets across locales
 * 3. Variable params ({param}) are consistent
 * 4. No empty string values
 * 5. common namespace has no reserved namespace nested prefixes
 * 6. All expected namespaces are present
 *
 * Exit code 0 = pass, 1 = fail
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', '..', 'src', 'shared', 'i18n', 'locales')

const SUPPORTED_LOCALES = ['zh-CN', 'en-US']
const EXPECTED_NAMESPACES = [
  'common', 'settings', 'navigation', 'composer',
  'sendPlan', 'errors', 'diagnostics', 'filePipeline', 'dialogs',
]
const RESERVED_NS_PREFIXES = [
  'settings', 'navigation', 'composer', 'sendPlan',
  'filePipeline', 'errors', 'diagnostics', 'dialogs',
]

let failures = 0
let warnings = 0

function fail(msg) {
  console.error(`  FAIL: ${msg}`)
  failures++
}

function warn(msg) {
  console.warn(`  WARN: ${msg}`)
  warnings++
}

function ok(msg) {
  console.log(`  OK: ${msg}`)
}

/** Flatten nested object to dot-separated key paths */
function flattenKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) {
      keys.push(...flattenKeys(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

/** Extract {param} placeholders from a message string */
function extractParams(msg) {
  const matches = msg.match(/\{(\w+)\}/g)
  return matches ? matches.map(m => m.slice(1, -1)).sort() : []
}

/** Get nested value by dot path */
function getNestedValue(obj, path) {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

/** Load a locale namespace JSON file */
function loadNamespace(locale, namespace) {
  const filePath = join(LOCALES_DIR, locale, `${namespace}.json`)
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    // JSON structure is { "namespace": { ... } }
    return parsed[namespace] ?? parsed
  } catch (err) {
    return null
  }
}

/** Get all namespace files for a locale */
function getNamespaceNames(locale) {
  const dir = join(LOCALES_DIR, locale)
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

// ── Main ──────────────────────────────────────────────────

console.log('i18n coverage check\n')

// 1. Check namespace set consistency
console.log('1. Namespace set consistency:')
const namespacesByLocale = {}
for (const locale of SUPPORTED_LOCALES) {
  namespacesByLocale[locale] = new Set(getNamespaceNames(locale))
}

for (const ns of EXPECTED_NAMESPACES) {
  for (const locale of SUPPORTED_LOCALES) {
    if (!namespacesByLocale[locale].has(ns)) {
      fail(`${locale} missing namespace: ${ns}`)
    }
  }
}

const allNs = new Set([...namespacesByLocale[SUPPORTED_LOCALES[0]]])
const refNs = namespacesByLocale[SUPPORTED_LOCALES[0]]
for (const locale of SUPPORTED_LOCALES.slice(1)) {
  const localeNs = namespacesByLocale[locale]
  for (const ns of localeNs) {
    if (!refNs.has(ns)) fail(`${SUPPORTED_LOCALES[0]} missing namespace: ${ns} (present in ${locale})`)
  }
  for (const ns of refNs) {
    if (!localeNs.has(ns)) fail(`${locale} missing namespace: ${ns} (present in ${SUPPORTED_LOCALES[0]})`)
  }
}
ok('All locales have matching namespace sets')

// 2. Key set consistency per namespace
console.log('\n2. Key set consistency per namespace:')
for (const ns of EXPECTED_NAMESPACES) {
  const localeKeys = {}
  for (const locale of SUPPORTED_LOCALES) {
    const data = loadNamespace(locale, ns)
    if (!data) {
      fail(`${locale}/${ns}: failed to load`)
      continue
    }
    localeKeys[locale] = flattenKeys(data).sort()
  }

  if (localeKeys[SUPPORTED_LOCALES[0]] && localeKeys[SUPPORTED_LOCALES[1]]) {
    const zhKeys = localeKeys[SUPPORTED_LOCALES[0]]
    const enKeys = localeKeys[SUPPORTED_LOCALES[1]]

    const missingInEn = zhKeys.filter(k => !enKeys.includes(k))
    const missingInZh = enKeys.filter(k => !zhKeys.includes(k))

    for (const k of missingInEn) fail(`${ns}: key '${k}' in zh-CN but missing in en-US`)
    for (const k of missingInZh) fail(`${ns}: key '${k}' in en-US but missing in zh-CN`)

    if (missingInEn.length === 0 && missingInZh.length === 0) {
      ok(`${ns}: ${zhKeys.length} keys match`)
    }
  }
}

// 3. Variable param consistency
console.log('\n3. Variable param consistency:')
for (const ns of EXPECTED_NAMESPACES) {
  const zhData = loadNamespace(SUPPORTED_LOCALES[0], ns)
  const enData = loadNamespace(SUPPORTED_LOCALES[1], ns)
  if (!zhData || !enData) continue

  const zhFlat = flattenKeys(zhData)
  for (const key of zhFlat) {
    const zhVal = getNestedValue(zhData, key)
    const enVal = getNestedValue(enData, key)
    if (typeof zhVal === 'string' && typeof enVal === 'string') {
      const zhParams = extractParams(zhVal)
      const enParams = extractParams(enVal)
      if (JSON.stringify(zhParams) !== JSON.stringify(enParams)) {
        fail(`${ns}.${key}: param mismatch — zh-CN=[${zhParams}] en-US=[${enParams}]`)
      }
    }
  }
}
ok('All variable params consistent')

// 4. No empty strings
console.log('\n4. Empty string check:')
let emptyCount = 0
for (const ns of EXPECTED_NAMESPACES) {
  for (const locale of SUPPORTED_LOCALES) {
    const data = loadNamespace(locale, ns)
    if (!data) continue
    const flat = flattenKeys(data)
    for (const key of flat) {
      const val = getNestedValue(data, key)
      if (typeof val === 'string' && val.trim() === '') {
        fail(`${locale}/${ns}.${key}: empty string`)
        emptyCount++
      }
    }
  }
}
if (emptyCount === 0) ok('No empty strings found')

// 5. Reserved namespace prefix check in common
console.log('\n5. Reserved namespace prefix check (common):')
const zhCommon = loadNamespace(SUPPORTED_LOCALES[0], 'common')
if (zhCommon) {
  const commonFlat = flattenKeys(zhCommon)
  const violations = []
  for (const key of commonFlat) {
    for (const prefix of RESERVED_NS_PREFIXES) {
      if (key.startsWith(`${prefix}.`)) {
        violations.push(key)
      }
    }
  }
  for (const v of violations) fail(`common.${v}: reserved namespace prefix`)
  if (violations.length === 0) ok('No reserved namespace prefixes in common')
}

// Summary
console.log(`\n${'='.repeat(50)}`)
if (failures > 0) {
  console.error(`\nResult: ${failures} failure(s), ${warnings} warning(s)`)
  process.exit(1)
} else {
  console.log(`\nResult: PASS (${warnings} warning(s))`)
  process.exit(0)
}
