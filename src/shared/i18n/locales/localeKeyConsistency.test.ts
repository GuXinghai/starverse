import { describe, expect, it, beforeEach } from 'vitest'
import zhCNCommon from './zh-CN/common.json'
import enUSCommon from './en-US/common.json'
import zhCNSettings from './zh-CN/settings.json'
import enUSSettings from './en-US/settings.json'
import zhCNNavigation from './zh-CN/navigation.json'
import enUSNavigation from './en-US/navigation.json'
import zhCNComposer from './zh-CN/composer.json'
import enUSComposer from './en-US/composer.json'
import zhCNSendPlan from './zh-CN/sendPlan.json'
import enUSSendPlan from './en-US/sendPlan.json'
import zhCNErrors from './zh-CN/errors.json'
import enUSErrors from './en-US/errors.json'
import zhCNDiagnostics from './zh-CN/diagnostics.json'
import enUSDiagnostics from './en-US/diagnostics.json'
import zhCNFilePipeline from './zh-CN/filePipeline.json'
import enUSFilePipeline from './en-US/filePipeline.json'
import zhCNDialogs from './zh-CN/dialogs.json'
import enUSDialogs from './en-US/dialogs.json'
import { t, getMessages, resetI18nForTests } from '../index'

/** Registered namespace names — must match messageRegistry keys in index.ts */
const REGISTERED_NAMESPACES = ['settings', 'navigation', 'composer', 'sendPlan', 'errors', 'diagnostics', 'filePipeline'] as const

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

  it('zh-CN and en-US sendPlan have identical keys', () => {
    const zhKeys = flattenKeys(zhCNSendPlan.sendPlan).sort()
    const enKeys = flattenKeys(enUSSendPlan.sendPlan).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US errors have identical keys', () => {
    const zhKeys = flattenKeys(zhCNErrors.errors).sort()
    const enKeys = flattenKeys(enUSErrors.errors).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US diagnostics have identical keys', () => {
    const zhKeys = flattenKeys(zhCNDiagnostics.diagnostics).sort()
    const enKeys = flattenKeys(enUSDiagnostics.diagnostics).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US filePipeline have identical keys', () => {
    const zhKeys = flattenKeys(zhCNFilePipeline.filePipeline).sort()
    const enKeys = flattenKeys(enUSFilePipeline.filePipeline).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('zh-CN and en-US dialogs have identical keys', () => {
    const zhKeys = flattenKeys(zhCNDialogs.dialogs).sort()
    const enKeys = flattenKeys(enUSDialogs.dialogs).sort()
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
      ...flattenKeys(zhCNSendPlan.sendPlan).map(k => `sendPlan.${k}`),
      ...flattenKeys(zhCNErrors.errors).map(k => `errors.${k}`),
      ...flattenKeys(zhCNDiagnostics.diagnostics).map(k => `diagnostics.${k}`),
      ...flattenKeys(zhCNFilePipeline.filePipeline).map(k => `filePipeline.${k}`),
      ...flattenKeys(zhCNDialogs.dialogs).map(k => `dialogs.${k}`),
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
      ['sendPlan.detectionPending', 'zh-CN', '附件仍在解析或检测中，完成后才能发送。'],
      ['sendPlan.detectionPending', 'en-US', 'Attachments are still being parsed or detected. Please wait.'],
      ['errors.provider.apiKeyInvalid', 'zh-CN', 'API Key 无效或已过期。'],
      ['errors.provider.apiKeyInvalid', 'en-US', 'API key is invalid or expired.'],
      ['diagnostics.detectFailed', 'zh-CN', '检测失败'],
      ['diagnostics.detectFailed', 'en-US', 'Detection failed'],
      ['filePipeline.detection.failed', 'zh-CN', '检测失败'],
      ['filePipeline.detection.failed', 'en-US', 'Failed'],
      ['dialogs.startup.dbInitFailed', 'zh-CN', '数据库初始化失败'],
      ['dialogs.startup.dbInitFailed', 'en-US', 'Database initialization failed'],
      ['dialogs.errors.invalidUrl', 'zh-CN', '无效的 URL。'],
      ['dialogs.errors.invalidUrl', 'en-US', 'Invalid URL.'],
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
      { zh: zhCNSendPlan.sendPlan, en: enUSSendPlan.sendPlan, name: 'sendPlan' },
      { zh: zhCNErrors.errors, en: enUSErrors.errors, name: 'errors' },
      { zh: zhCNDiagnostics.diagnostics, en: enUSDiagnostics.diagnostics, name: 'diagnostics' },
      { zh: zhCNFilePipeline.filePipeline, en: enUSFilePipeline.filePipeline, name: 'filePipeline' },
      { zh: zhCNDialogs.dialogs, en: enUSDialogs.dialogs, name: 'dialogs' },
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
    const nsNames = ['common', 'settings', 'navigation', 'composer', 'sendPlan', 'errors', 'diagnostics', 'filePipeline', 'dialogs']
    for (const ns of nsNames) {
      const zhMsgs = getMessages('zh-CN', ns)
      expect(zhMsgs).toBeDefined()
      const enMsgs = getMessages('en-US', ns)
      expect(enMsgs).toBeDefined()
    }
  })

  it('sendPlan.sendMode keys resolve in both locales', () => {
    const modes = ['default', 'auto', 'urlRef', 'inlineBase64', 'providerFileRef']
    for (const mode of modes) {
      const zhVal = t(`sendPlan.sendMode.${mode}`, 'zh-CN')
      expect(zhVal).not.toBe(`sendPlan.sendMode.${mode}`)
      const enVal = t(`sendPlan.sendMode.${mode}`, 'en-US')
      expect(enVal).not.toBe(`sendPlan.sendMode.${mode}`)
    }
  })

  it('all issue code i18n targets exist in sendPlan namespace', () => {
    // These are the i18n keys referenced by ISSUE_CODE_TO_I18N in appChatApp.logic.ts
    // If any key is missing from the JSON, t() would return the raw key.
    const referencedKeys = [
      'sendPlan.detectionPending',
      'sendPlan.routeUnavailable',
      'sendPlan.attachmentBlocked',
      'sendPlan.historyAttachmentExcluded',
      'sendPlan.detectionRequired',
      'sendPlan.detectionFailed',
      'sendPlan.unsupportedAttachment',
      'sendPlan.modelDoesNotSupportFiles',
      'sendPlan.pdfNotSupportedByProvider',
      'sendPlan.conversionRequired',
      'sendPlan.conversionUnavailable',
      'sendPlan.noSendableRepresentation',
      'sendPlan.audioNoUrlRef',
      'sendPlan.attachmentContentRisk',
    ]
    for (const key of referencedKeys) {
      const zhVal = t(key, 'zh-CN')
      expect(zhVal).not.toBe(key)
      const enVal = t(key, 'en-US')
      expect(enVal).not.toBe(key)
    }
  })
})
