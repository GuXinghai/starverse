import { describe, expect, it, beforeEach } from 'vitest'
import zhCNCommon from './zh-CN/common.json'
import enUSCommon from './en-US/common.json'
import zhCNSettings from './zh-CN/settings.json'
import enUSSettings from './en-US/settings.json'
import zhCNNavigation from './zh-CN/navigation.json'
import enUSNavigation from './en-US/navigation.json'
import zhCNComposer from './zh-CN/composer.json'
import enUSComposer from './en-US/composer.json'
import { t, getMessages, resetI18nForTests } from '../index'

/** Registered namespace names — must match messageRegistry keys in index.ts */
const REGISTERED_NAMESPACES = ['settings', 'navigation', 'composer'] as const

/**
 * Reserved top-level prefixes that common namespace must not use as nested key paths.
 * e.g. common.json must not contain "settings.title" or "navigation.project.title",
 * but a flat key named "settings" is acceptable.
 */
const RESERVED_NS_PREFIXES = [
  ...REGISTERED_NAMESPACES,
  'filePipeline',
  'errors',
  'diagnostics',
]

function flattenKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = []
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
function extractParams(msg: string): string[] {
  const matches = msg.match(/\{(\w+)\}/g)
  return matches ? matches.map(m => m.slice(1, -1)).sort() : []
}

describe('locale key consistency', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it('zh-CN and en-US common have identical keys', () => {
    const zhKeys = flattenKeys(zhCNCommon.common).sort()
    const enKeys = flattenKeys(enUSCommon.common).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US settings have identical keys', () => {
    const zhKeys = flattenKeys(zhCNSettings.settings).sort()
    const enKeys = flattenKeys(enUSSettings.settings).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US navigation have identical keys', () => {
    const zhKeys = flattenKeys(zhCNNavigation.navigation).sort()
    const enKeys = flattenKeys(enUSNavigation.navigation).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US composer have identical keys', () => {
    const zhKeys = flattenKeys(zhCNComposer.composer).sort()
    const enKeys = flattenKeys(enUSComposer.composer).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('common namespace has at least core action keys', () => {
    const coreKeys = ['ok', 'cancel', 'save', 'delete', 'close', 'search', 'send', 'stop']
    for (const key of coreKeys) {
      expect((zhCNCommon.common as any)[key]).toBeTruthy()
      expect((enUSCommon.common as any)[key]).toBeTruthy()
    }
  })

  it('settings namespace has at least title key', () => {
    expect((zhCNSettings.settings as any).title).toBeTruthy()
    expect((enUSSettings.settings as any).title).toBeTruthy()
  })

  it('navigation namespace has at least project.title key', () => {
    expect((zhCNNavigation.navigation as any).project.title).toBeTruthy()
    expect((enUSNavigation.navigation as any).project.title).toBeTruthy()
  })

  it('composer namespace has at least actions.send key', () => {
    expect((zhCNComposer.composer as any).actions.send).toBeTruthy()
    expect((enUSComposer.composer as any).actions.send).toBeTruthy()
  })

  it('common namespace has no nested keys with reserved namespace prefixes', () => {
    // common.json flat keys (like "settings") are acceptable.
    // But nested paths like "settings.title" in common.json would be ambiguous
    // with namespace-detection-first lookup and must be forbidden.
    const zhCommonFlat = flattenKeys(zhCNCommon.common)
    const enCommonFlat = flattenKeys(enUSCommon.common)
    const violations: string[] = []
    for (const key of [...zhCommonFlat, ...enCommonFlat]) {
      for (const prefix of RESERVED_NS_PREFIXES) {
        if (key.startsWith(`${prefix}.`)) {
          violations.push(key)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('cross-namespace key paths do not silently shadow each other', () => {
    const allZhKeys = [
      ...flattenKeys(zhCNCommon.common).map(k => `common.${k}`),
      ...flattenKeys(zhCNSettings.settings).map(k => `settings.${k}`),
      ...flattenKeys(zhCNNavigation.navigation).map(k => `navigation.${k}`),
      ...flattenKeys(zhCNComposer.composer).map(k => `composer.${k}`),
    ]
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const k of allZhKeys) {
      if (seen.has(k)) dupes.push(k)
      seen.add(k)
    }
    expect(dupes).toEqual([])
  })

  it('t() resolves all namespace-qualified keys without returning raw key', () => {
    const testCases = [
      ['settings.title', 'zh-CN', '设置'],
      ['settings.title', 'en-US', 'Settings'],
      ['navigation.project.title', 'zh-CN', '项目'],
      ['navigation.project.title', 'en-US', 'Projects'],
      ['composer.actions.send', 'zh-CN', '发送'],
      ['composer.actions.send', 'en-US', 'Send'],
      ['common.ok', 'zh-CN', '确定'],
      ['common.ok', 'en-US', 'OK'],
    ]
    for (const [key, locale, expected] of testCases) {
      expect(t(key, locale as any)).toBe(expected)
    }
  })

  it('zh-CN and en-US variable params are consistent per namespace', () => {
    const namespaces = [
      { zh: zhCNCommon.common, en: enUSCommon.common, name: 'common' },
      { zh: zhCNSettings.settings, en: enUSSettings.settings, name: 'settings' },
      { zh: zhCNNavigation.navigation, en: enUSNavigation.navigation, name: 'navigation' },
      { zh: zhCNComposer.composer, en: enUSComposer.composer, name: 'composer' },
    ]
    for (const ns of namespaces) {
      const zhFlat = flattenKeys(ns.zh)
      for (const key of zhFlat) {
        const parts = key.split('.')
        let zhVal: any = ns.zh
        let enVal: any = ns.en
        for (const p of parts) {
          zhVal = zhVal?.[p]
          enVal = enVal?.[p]
        }
        if (typeof zhVal === 'string' && typeof enVal === 'string') {
          const zhParams = extractParams(zhVal)
          const enParams = extractParams(enVal)
          expect(enParams).toEqual(zhParams)
        }
      }
    }
  })

  it('getMessages returns inner content for all namespaces', () => {
    const nsNames = ['common', 'settings', 'navigation', 'composer']
    for (const ns of nsNames) {
      const zhMsgs = getMessages('zh-CN', ns)
      expect(zhMsgs).toBeDefined()
      const enMsgs = getMessages('en-US', ns)
      expect(enMsgs).toBeDefined()
    }
  })
})
