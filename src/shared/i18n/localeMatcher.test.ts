import { describe, expect, it } from 'vitest'
import { matchLocale, matchSystemLocale, normalizeLanguagePrefs } from './localeMatcher'

describe('localeMatcher', () => {
  describe('matchLocale', () => {
    it('matches zh-CN exactly', () => {
      expect(matchLocale('zh-CN')).toBe('zh-CN')
    })

    it('matches en-US exactly', () => {
      expect(matchLocale('en-US')).toBe('en-US')
    })

    it('matches zh to zh-CN', () => {
      expect(matchLocale('zh')).toBe('zh-CN')
    })

    it('matches zh-Hans to zh-CN', () => {
      expect(matchLocale('zh-Hans')).toBe('zh-CN')
    })

    it('matches zh-Hant to zh-CN', () => {
      expect(matchLocale('zh-Hant')).toBe('zh-CN')
    })

    it('matches zh-Hans-CN to zh-CN', () => {
      expect(matchLocale('zh-Hans-CN')).toBe('zh-CN')
    })

    it('matches en to en-US', () => {
      expect(matchLocale('en')).toBe('en-US')
    })

    it('matches en-GB to en-US', () => {
      expect(matchLocale('en-GB')).toBe('en-US')
    })

    it('matches en-AU to en-US', () => {
      expect(matchLocale('en-AU')).toBe('en-US')
    })

    it('returns DEFAULT_LOCALE for unknown locale', () => {
      expect(matchLocale('ja-JP')).toBe('zh-CN')
      expect(matchLocale('fr')).toBe('zh-CN')
      expect(matchLocale('de-DE')).toBe('zh-CN')
    })

    it('returns DEFAULT_LOCALE for null/undefined', () => {
      expect(matchLocale(null)).toBe('zh-CN')
      expect(matchLocale(undefined)).toBe('zh-CN')
    })

    it('returns DEFAULT_LOCALE for empty string', () => {
      expect(matchLocale('')).toBe('zh-CN')
    })

    it('handles whitespace', () => {
      expect(matchLocale('  zh-CN  ')).toBe('zh-CN')
    })

    it('is case-sensitive for exact match but case-insensitive for prefix', () => {
      // Exact match is case-sensitive
      expect(matchLocale('zh-cn')).toBe('zh-CN') // falls through to prefix match
      expect(matchLocale('EN')).toBe('en-US') // prefix match
    })
  })

  describe('matchSystemLocale', () => {
    it('matches zh from languages list', () => {
      expect(matchSystemLocale(['zh-CN', 'en-US'])).toBe('zh-CN')
    })

    it('matches en from languages list', () => {
      expect(matchSystemLocale(['en-US', 'zh-CN'])).toBe('en-US')
    })

    it('matches zh-Hans from languages list', () => {
      expect(matchSystemLocale(['zh-Hans'])).toBe('zh-CN')
    })

    it('matches en-GB from languages list', () => {
      expect(matchSystemLocale(['en-GB'])).toBe('en-US')
    })

    it('falls back to singleLanguage when list is empty', () => {
      expect(matchSystemLocale([], 'zh-CN')).toBe('zh-CN')
    })

    it('falls back to singleLanguage when list is null', () => {
      expect(matchSystemLocale(null, 'en-US')).toBe('en-US')
    })

    it('returns DEFAULT_LOCALE for unknown list and no single', () => {
      expect(matchSystemLocale(['ja-JP', 'fr-FR'])).toBe('zh-CN')
    })

    it('returns DEFAULT_LOCALE when all inputs are null', () => {
      expect(matchSystemLocale(null, null)).toBe('zh-CN')
    })

    it('prioritizes first matching language in list', () => {
      expect(matchSystemLocale(['ja-JP', 'zh-CN', 'en-US'])).toBe('zh-CN')
      expect(matchSystemLocale(['ja-JP', 'en-US', 'zh-CN'])).toBe('en-US')
    })
  })

  describe('normalizeLanguagePrefs', () => {
    it('returns defaults for empty input', () => {
      const result = normalizeLanguagePrefs({})
      expect(result).toEqual({
        mode: 'manual',
        uiLocale: 'zh-CN',
        fallbackLocale: 'zh-CN', // matchLocale(undefined) → DEFAULT_LOCALE
      })
    })

    it('preserves valid mode', () => {
      expect(normalizeLanguagePrefs({ mode: 'system' }).mode).toBe('system')
      expect(normalizeLanguagePrefs({ mode: 'manual' }).mode).toBe('manual')
    })

    it('defaults invalid mode to manual', () => {
      expect(normalizeLanguagePrefs({ mode: 'auto' }).mode).toBe('manual')
      expect(normalizeLanguagePrefs({ mode: 42 }).mode).toBe('manual')
    })

    it('normalizes uiLocale', () => {
      expect(normalizeLanguagePrefs({ uiLocale: 'en' }).uiLocale).toBe('en-US')
      expect(normalizeLanguagePrefs({ uiLocale: 'zh' }).uiLocale).toBe('zh-CN')
    })

    it('normalizes fallbackLocale', () => {
      expect(normalizeLanguagePrefs({ fallbackLocale: 'en' }).fallbackLocale).toBe('en-US')
    })
  })
})
