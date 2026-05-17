import { describe, expect, it } from 'vitest'
import zhCNCommon from './zh-CN/common.json'
import enUSCommon from './en-US/common.json'
import zhCNSettings from './zh-CN/settings.json'
import enUSSettings from './en-US/settings.json'
import zhCNNavigation from './zh-CN/navigation.json'
import enUSNavigation from './en-US/navigation.json'
import zhCNComposer from './zh-CN/composer.json'
import enUSComposer from './en-US/composer.json'

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

describe('locale key consistency', () => {
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
})
