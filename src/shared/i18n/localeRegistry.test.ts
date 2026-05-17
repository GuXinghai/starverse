import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALE_DISPLAY_NAMES, isSupportedLocale } from './localeRegistry'

describe('localeRegistry', () => {
  it('SUPPORTED_LOCALES contains exactly zh-CN and en-US', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en-US'])
  })

  it('DEFAULT_LOCALE is zh-CN', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN')
  })

  it('FALLBACK_LOCALE is en-US', () => {
    expect(FALLBACK_LOCALE).toBe('en-US')
  })

  it('LOCALE_DISPLAY_NAMES covers all supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_DISPLAY_NAMES[locale]).toBeTruthy()
    }
  })

  describe('isSupportedLocale', () => {
    it('returns true for zh-CN', () => {
      expect(isSupportedLocale('zh-CN')).toBe(true)
    })

    it('returns true for en-US', () => {
      expect(isSupportedLocale('en-US')).toBe(true)
    })

    it('returns false for zh', () => {
      expect(isSupportedLocale('zh')).toBe(false)
    })

    it('returns false for en', () => {
      expect(isSupportedLocale('en')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isSupportedLocale('')).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(isSupportedLocale(null)).toBe(false)
      expect(isSupportedLocale(undefined)).toBe(false)
    })

    it('returns false for number', () => {
      expect(isSupportedLocale(42)).toBe(false)
    })
  })
})
