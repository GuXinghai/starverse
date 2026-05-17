import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLanguagePrefs, saveLanguagePref, saveLanguagePrefSystem, getStoredLanguagePref, getSystemLocale } from './languagePrefs'

describe('languagePrefs', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  describe('loadLanguagePrefs', () => {
    it('returns manual prefs from electron-store', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'en-US'
        if (key === 'languageManual') return 'en-US'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.uiLocale).toBe('en-US')
      expect(prefs.mode).toBe('manual')
      expect(prefs.fallbackLocale).toBe('en-US')
    })

    it('returns system mode prefs when language is system', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'system'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.mode).toBe('system')
      expect(['zh-CN', 'en-US']).toContain(prefs.uiLocale)
    })

    it('falls back to languageManual when language key is missing', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return undefined
        if (key === 'languageManual') return 'en-US'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.mode).toBe('manual')
      expect(prefs.uiLocale).toBe('en-US')
    })

    it('returns defaults when electron-store is unavailable', async () => {
      ;(globalThis as any).electronStore = null

      const prefs = await loadLanguagePrefs()
      expect(prefs.mode).toBe('system')
      expect(['zh-CN', 'en-US']).toContain(prefs.uiLocale)
    })

    it('normalizes unknown locale to default', async () => {
      const get = vi.fn(async () => 'ja-JP')
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.uiLocale).toBe('zh-CN')
    })

    it('handles invalid persisted language fallback', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'invalid-locale'
        if (key === 'languageManual') return 'fr-FR'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const prefs = await loadLanguagePrefs()
      expect(prefs.mode).toBe('manual')
      expect(prefs.uiLocale).toBe('zh-CN') // matchLocale normalizes unknown to DEFAULT
    })
  })

  describe('saveLanguagePref', () => {
    it('saves to electron-store', async () => {
      const set = vi.fn(async () => {})
      ;(globalThis as any).electronStore = { get: vi.fn(), set }

      await saveLanguagePref('en-US')
      expect(set).toHaveBeenCalledWith('language', 'en-US')
      expect(set).toHaveBeenCalledWith('languageManual', 'en-US')
    })

    it('does not throw when electron-store is unavailable', async () => {
      ;(globalThis as any).electronStore = null

      await expect(saveLanguagePref('en-US')).resolves.not.toThrow()
    })
  })

  describe('saveLanguagePrefSystem', () => {
    it('saves system mode to electron-store', async () => {
      const set = vi.fn(async () => {})
      ;(globalThis as any).electronStore = { get: vi.fn(), set }

      await saveLanguagePrefSystem()
      expect(set).toHaveBeenCalledWith('language', 'system')
    })

    it('does not throw when electron-store is unavailable', async () => {
      ;(globalThis as any).electronStore = null

      await expect(saveLanguagePrefSystem()).resolves.not.toThrow()
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

    it('returns system locale when stored as system', async () => {
      const get = vi.fn(async (key: string) => {
        if (key === 'language') return 'system'
        return undefined
      })
      ;(globalThis as any).electronStore = { get, set: vi.fn() }

      const result = await getStoredLanguagePref()
      expect(['zh-CN', 'en-US']).toContain(result)
    })

    it('returns default when unavailable', async () => {
      ;(globalThis as any).electronStore = null

      await expect(getStoredLanguagePref()).resolves.toBe('zh-CN')
    })
  })

  describe('getSystemLocale', () => {
    it('returns a SupportedLocale', () => {
      const result = getSystemLocale()
      expect(['zh-CN', 'en-US']).toContain(result)
    })
  })
})
