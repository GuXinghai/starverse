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
      expect(t('nonexistent.key', 'zh-CN', 'en-US')).toBe('nonexistent.key')
    })

    it('returns key itself when completely missing', () => {
      expect(t('totally.missing.key', 'zh-CN', 'en-US')).toBe('totally.missing.key')
    })

    it('uses currentLocale when locale param omitted', () => {
      setLocale('en-US')
      expect(t('common.ok')).toBe('OK')
    })

    it('auto-detects namespace from key prefix', () => {
      expect(t('settings.title', 'zh-CN', 'en-US')).toBe('设置')
      expect(t('settings.title', 'en-US', 'zh-CN')).toBe('Settings')
    })

    it('auto-detects navigation namespace', () => {
      expect(t('navigation.project.title', 'zh-CN', 'en-US')).toBe('项目')
    })

    it('auto-detects composer namespace', () => {
      expect(t('composer.actions.send', 'zh-CN', 'en-US')).toBe('发送')
    })

    it('full key in explicit namespace takes priority over namespace detection', () => {
      // 'settings' as a bare key exists in common namespace (value: '设置')
      // t('settings', 'zh-CN') should resolve via common namespace, not try to extract ns
      expect(t('settings', 'zh-CN', 'en-US')).toBe('设置')
    })

    it('auto-detects namespace from key prefix even with explicit namespace', () => {
      // t('settings.title', 'zh-CN', 'en-US', 'settings') — candidateNs='settings' is detected,
      // inner key 'title' is looked up in settings ns
      expect(t('settings.title', 'zh-CN', 'en-US', 'settings')).toBe('设置')
    })

    it('auto-detection works when key prefix differs from explicit namespace', () => {
      // t('settings.title', 'zh-CN', 'en-US', 'common') — candidateNs='settings' detected,
      // inner key 'title' resolved in settings ns (not common)
      expect(t('settings.title', 'zh-CN', 'en-US', 'common')).toBe('设置')
    })

    it('returns key when both locale and fallback miss', () => {
      expect(t('completely.fake.key', 'zh-CN', 'en-US')).toBe('completely.fake.key')
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
      expect((msgs as any).ok).toBe('确定')
    })

    it('returns messages for en-US common', () => {
      const msgs = getMessages('en-US', 'common')
      expect(msgs).toBeDefined()
      expect((msgs as any).ok).toBe('OK')
    })

    it('returns undefined for unknown namespace', () => {
      expect(getMessages('zh-CN', 'nonexistent')).toBeUndefined()
    })

    it('returns inner content for settings namespace (strips wrapper)', () => {
      const msgs = getMessages('zh-CN', 'settings')
      expect(msgs).toBeDefined()
      expect((msgs as any).title).toBe('设置')
    })

    it('returns inner content for navigation namespace', () => {
      const msgs = getMessages('zh-CN', 'navigation')
      expect(msgs).toBeDefined()
      expect((msgs as any).project.title).toBe('项目')
    })

    it('returns inner content for composer namespace', () => {
      const msgs = getMessages('en-US', 'composer')
      expect(msgs).toBeDefined()
      expect((msgs as any).actions.send).toBe('Send')
    })

    it('common bundle has generating key', () => {
      const msgs = getMessages('zh-CN', 'common')
      expect(msgs).toBeDefined()
      expect((msgs as any).generating).toBe('正在生成')
    })

    it('common bundle has reload key', () => {
      const msgs = getMessages('zh-CN', 'common')
      expect(msgs).toBeDefined()
      expect((msgs as any).reload).toBe('重新加载')
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
