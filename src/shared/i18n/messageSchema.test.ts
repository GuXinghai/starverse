import { describe, expect, it } from 'vitest'
import zhCN from './locales/zh-CN/common.json'
import enUS from './locales/en-US/common.json'

describe('common.json key consistency', () => {
  it('zh-CN and en-US have identical top-level keys', () => {
    expect(Object.keys(zhCN.common).sort()).toEqual(Object.keys(enUS.common).sort())
  })

  it('both have at least the core keys', () => {
    const coreKeys = ['ok', 'cancel', 'confirm', 'save', 'delete', 'close', 'settings']
    for (const key of coreKeys) {
      expect((zhCN.common as any)[key]).toBeTruthy()
      expect((enUS.common as any)[key]).toBeTruthy()
    }
  })

  it('all values are strings', () => {
    for (const [, value] of Object.entries(zhCN.common)) {
      expect(typeof value).toBe('string')
    }
    for (const [, value] of Object.entries(enUS.common)) {
      expect(typeof value).toBe('string')
    }
  })
})
