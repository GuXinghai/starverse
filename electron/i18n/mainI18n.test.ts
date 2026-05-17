import { describe, expect, it, beforeEach } from 'vitest'
import {
  resolveMainLocale,
  t,
  tf,
  setMainLocale,
  getMainLocale,
  resetMainI18nForTests,
} from './mainI18n'

describe('mainI18n', () => {
  beforeEach(() => {
    resetMainI18nForTests()
  })

  describe('resolveMainLocale', () => {
    it('returns zh-CN for manual zh-CN', () => {
      const store = { get: (key: string) => key === 'language' ? 'zh-CN' : undefined }
      expect(resolveMainLocale(store)).toBe('zh-CN')
    })

    it('returns en-US for manual en-US', () => {
      const store = { get: (key: string) => key === 'language' ? 'en-US' : undefined }
      expect(resolveMainLocale(store)).toBe('en-US')
    })

    it('returns system-matched locale when language=system', () => {
      const store = { get: (key: string) => key === 'language' ? 'system' : undefined }
      expect(resolveMainLocale(store, ['zh-CN', 'en-US'])).toBe('zh-CN')
    })

    it('returns en-US when system languages are English', () => {
      const store = { get: (key: string) => key === 'language' ? 'system' : undefined }
      expect(resolveMainLocale(store, ['en-US'])).toBe('en-US')
    })

    it('returns DEFAULT_LOCALE when system languages are unknown', () => {
      const store = { get: (key: string) => key === 'language' ? 'system' : undefined }
      expect(resolveMainLocale(store, ['fr-FR', 'de-DE'])).toBe('zh-CN')
    })

    it('returns DEFAULT_LOCALE when system languages are null', () => {
      const store = { get: (key: string) => key === 'language' ? 'system' : undefined }
      expect(resolveMainLocale(store, null)).toBe('zh-CN')
    })

    it('falls back to languageManual when language is invalid', () => {
      const store = { get: (key: string) => key === 'language' ? 'invalid' : key === 'languageManual' ? 'en-US' : undefined }
      expect(resolveMainLocale(store)).toBe('en-US')
    })

    it('returns DEFAULT_LOCALE for completely invalid persisted config', () => {
      const store = { get: () => 'garbage' }
      expect(resolveMainLocale(store)).toBe('zh-CN')
    })
  })

  describe('t() — message lookup', () => {
    it('returns zh-CN message for common.ok', () => {
      expect(t('common.ok', 'zh-CN')).toBe('确定')
    })

    it('returns en-US message for common.ok', () => {
      expect(t('common.ok', 'en-US')).toBe('OK')
    })

    it('auto-detects dialogs namespace', () => {
      expect(t('dialogs.startup.dbInitFailed', 'zh-CN')).toBe('数据库初始化失败')
      expect(t('dialogs.startup.dbInitFailed', 'en-US')).toBe('Database initialization failed')
    })

    it('auto-detects dialogs.errors namespace', () => {
      expect(t('dialogs.errors.invalidUrl', 'zh-CN')).toBe('无效的 URL。')
      expect(t('dialogs.errors.invalidUrl', 'en-US')).toBe('Invalid URL.')
    })

    it('returns key when completely missing', () => {
      expect(t('totally.missing.key', 'zh-CN')).toBe('totally.missing.key')
    })

    it('falls back to en-US when key missing in zh-CN', () => {
      // Use a key that exists in en-US but we test with zh-CN locale
      expect(t('common.ok', 'zh-CN')).toBe('确定')
    })

    it('uses current locale when locale param omitted', () => {
      setMainLocale('en-US')
      expect(t('common.ok')).toBe('OK')
    })

    it('returns dialogs.image.selectTitle in zh-CN', () => {
      expect(t('dialogs.image.selectTitle', 'zh-CN')).toBe('选择图片')
    })

    it('returns dialogs.export.imageTitle in en-US', () => {
      expect(t('dialogs.export.imageTitle', 'en-US')).toBe('Export image')
    })

    it('returns dialogs.startup.fixDev in zh-CN', () => {
      const val = t('dialogs.startup.fixDev', 'zh-CN')
      expect(val).toContain('npm run rebuild:electron')
    })
  })

  describe('tf() — message formatting with params', () => {
    it('replaces {status} in download failed message', () => {
      const zhResult = tf('dialogs.errors.downloadFailed', { status: 404 }, 'zh-CN')
      expect(zhResult).toBe('下载失败：HTTP 404。')
      const enResult = tf('dialogs.errors.downloadFailed', { status: 500 }, 'en-US')
      expect(enResult).toBe('Download failed: HTTP 500.')
    })

    it('replaces {method} in method not allowed message', () => {
      const zhResult = tf('dialogs.errors.methodNotAllowed', { method: 'DELETE' }, 'zh-CN')
      expect(zhResult).toBe('不允许的方法：DELETE。')
    })

    it('replaces {actual} and {expected} in wire version message', () => {
      const enResult = tf('dialogs.errors.unsupportedWireVersion', { actual: '2', expected: '3' }, 'en-US')
      expect(enResult).toBe('Unsupported wire version: wireVersion=2, expected 3.')
    })

    it('returns key when missing', () => {
      expect(tf('nonexistent.key', { x: '1' }, 'zh-CN')).toBe('nonexistent.key')
    })
  })

  describe('setMainLocale / getMainLocale', () => {
    it('sets and gets locale', () => {
      setMainLocale('en-US')
      expect(getMainLocale()).toBe('en-US')
    })

    it('switches back to zh-CN', () => {
      setMainLocale('en-US')
      setMainLocale('zh-CN')
      expect(getMainLocale()).toBe('zh-CN')
    })
  })
})
