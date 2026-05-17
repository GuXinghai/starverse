import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLanguagePrefs, saveLanguagePref, getStoredLanguagePref } from './languagePrefs'

describe('languagePrefs', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  describe('loadLanguagePrefs', () => {
    it('returns prefs from electron-store', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'en-US'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.uiLocale).toBe('en-US')
      expect(prefs.mode).toBe('manual')
      expect(prefs.fallbackLocale).toBe('en-US')
    })

    it('returns defaults when electron-store is unavailable', async () => {
      ;(globalThis as any).electronStore = null

      const prefs = await loadLanguagePrefs()
      expect(prefs.uiLocale).toBe('zh-CN')
      expect(prefs.fallbackLocale).toBe('zh-CN') // matchLocale(undefined) → DEFAULT_LOCALE
    })

    it('normalizes unknown locale to default', async () => {
      const get = vi.fn(async () => 'ja-JP')
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.uiLocale).toBe('zh-CN')
    })
  })

  describe('saveLanguagePref', () => {
    it('saves to electron-store', async () => {
      const set = vi.fn(async () => {})
      ;(globalThis as any).electronStore = { get: vi.fn(), set }

      await saveLanguagePref('en-US')
      expect(set).toHaveBeenCalledWith('language', 'en-US')
    })

    it('does not throw when electron-store is unavailable', async () => {
      ;(globalThis as any).electronStore = null

      await expect(saveLanguagePref('en-US')).resolves.not.toThrow()
    })
  })

  describe('getStoredLanguagePref', () => {
    it('returns stored locale', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'en-US'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      await expect(getStoredLanguagePref()).resolves.toBe('en-US')
    })

    it('returns default when unavailable', async () => {
      ;(globalThis as any).electronStore = null

      await expect(getStoredLanguagePref()).resolves.toBe('zh-CN')
    })
  })
})
