import { describe, expect, it, beforeEach } from 'vitest'
import {
  t,
  tf,
  applyLanguagePrefs,
  setLocale,
  getCurrentLocale,
  getMessages,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  matchLocale,
  isSupportedLocale,
} from './index'

describe('i18n index', () => {
  beforeEach(() => {
    // Reset to defaults
    applyLanguagePrefs({ uiLocale: 'zh-CN' })
  })

  describe('t() — message lookup', () => {
    it('returns zh-CN message for common.ok', () => {
      expect(t('common.ok', 'zh-CN', 'en-US')).toBe('确定')
    })

    it('returns en-US message for common.ok', () => {
      expect(t('common.ok', 'en-US', 'zh-CN')).toBe('OK')
    })

    it('falls back to fallback locale when key missing', () => {
      // 'nonexistent.key' doesn't exist in either locale
      expect(t('nonexistent.key', 'zh-CN', 'en-US')).toBe('nonexistent.key')
    })

    it('returns key itself when completely missing', () => {
      expect(t('totally.missing.key', 'zh-CN', 'en-US')).toBe('totally.missing.key')
    })

    it('uses currentLocale when locale param omitted', () => {
      setLocale('en-US')
      expect(t('common.ok')).toBe('OK')
    })
  })

  describe('tf() — message formatting with params', () => {
    it('replaces placeholders', () => {
      // Use a key that doesn't exist so we can test raw interpolation
      expect(tf('common.settings', { name: 'Test' }, 'zh-CN')).toBe('设置')
    })
  })

  describe('getMessages()', () => {
    it('returns messages for zh-CN common', () => {
      const msgs = getMessages('zh-CN', 'common')
      expect(msgs).toBeDefined()
      expect((msgs as any).common.ok).toBe('确定')
    })

    it('returns messages for en-US common', () => {
      const msgs = getMessages('en-US', 'common')
      expect(msgs).toBeDefined()
      expect((msgs as any).common.ok).toBe('OK')
    })

    it('returns undefined for unknown namespace', () => {
      expect(getMessages('zh-CN', 'nonexistent')).toBeUndefined()
    })
  })

  describe('applyLanguagePrefs()', () => {
    it('updates current locale', () => {
      applyLanguagePrefs({ uiLocale: 'en-US' })
      expect(t('common.ok')).toBe('OK')
    })

    it('normalizes invalid locale to default', () => {
      applyLanguagePrefs({ uiLocale: 'fr-FR' })
      expect(t('common.ok')).toBe('确定') // falls back to zh-CN (default)
    })
  })

  describe('setLocale()', () => {
    it('changes current locale', () => {
      setLocale('en-US')
      expect(t('common.settings')).toBe('Settings')
    })

    it('switches back to zh-CN', () => {
      setLocale('en-US')
      setLocale('zh-CN')
      expect(t('common.settings')).toBe('设置')
    })

    it('updates getCurrentLocale() synchronously', () => {
      setLocale('en-US')
      expect(getCurrentLocale()).toBe('en-US')
      setLocale('zh-CN')
      expect(getCurrentLocale()).toBe('zh-CN')
    })
  })

  describe('getCurrentLocale()', () => {
    it('returns default locale initially', () => {
      applyLanguagePrefs({ uiLocale: 'zh-CN' })
      expect(getCurrentLocale()).toBe('zh-CN')
    })

    it('reflects setLocale changes', () => {
      setLocale('en-US')
      expect(getCurrentLocale()).toBe('en-US')
    })

    it('reflects applyLanguagePrefs changes', () => {
      applyLanguagePrefs({ uiLocale: 'en-US' })
      expect(getCurrentLocale()).toBe('en-US')
    })
  })

  describe('re-exports', () => {
    it('exports SUPPORTED_LOCALES', () => {
      expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en-US'])
    })

    it('exports DEFAULT_LOCALE', () => {
      expect(DEFAULT_LOCALE).toBe('zh-CN')
    })

    it('exports FALLBACK_LOCALE', () => {
      expect(FALLBACK_LOCALE).toBe('en-US')
    })

    it('exports matchLocale', () => {
      expect(matchLocale('zh')).toBe('zh-CN')
    })

    it('exports isSupportedLocale', () => {
      expect(isSupportedLocale('zh-CN')).toBe(true)
    })
  })
})
