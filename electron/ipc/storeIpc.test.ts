import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { safeClearConfig } from '../config/configSchema'
import { OPENROUTER_CATALOG_LOCAL_SECRET_KEY } from '../modelCatalog/catalogScope'
import { registerStoreIpc, RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS } from './storeIpc'

vi.mock('../config/configSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/configSchema')>()
  return {
    ...actual,
    safeClearConfig: vi.fn(() => 'config.backup.json'),
  }
})

const testDir = dirname(fileURLToPath(import.meta.url))

function registerHandlers(input?: { refreshMainLocale?: () => void; initialStore?: Record<string, unknown> }) {
  const registerInvoke = vi.fn()
  const values = new Map<string, unknown>(Object.entries(input?.initialStore ?? {}))
  const store = {
    store: { language: 'en-US', languageManual: 'en-US' },
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value)
    }),
    delete: vi.fn((key: string) => {
      values.delete(key)
    }),
    clear: vi.fn(),
    has: vi.fn(() => true),
  } as any
  registerStoreIpc({
    registerInvoke,
    store,
    isDev: false,
    performConfigSizeCheck: vi.fn(),
    migrateAndCleanupConfig: vi.fn(),
    refreshMainLocale: input?.refreshMainLocale,
  })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store }
}

describe('registerStoreIpc', () => {
  it('refreshes main locale after language writes without changing store-set shape', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers, store } = registerHandlers({ refreshMainLocale })

    const result = await handlers.get('store-set')?.({}, 'language', 'en-US')

    expect(result).toBe(true)
    expect(store.set).toHaveBeenCalledWith('language', 'en-US')
    expect(refreshMainLocale).toHaveBeenCalledTimes(1)
  })

  it('refreshes main locale after languageManual writes', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers } = registerHandlers({ refreshMainLocale })

    await handlers.get('store-set')?.({}, 'languageManual', 'zh-CN')

    expect(refreshMainLocale).toHaveBeenCalledTimes(1)
  })

  it('refreshes main locale after deleting language settings', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers, store } = registerHandlers({ refreshMainLocale })

    await handlers.get('store-delete')?.({}, 'language')

    expect(store.delete).toHaveBeenCalledWith('language')
    expect(refreshMainLocale).toHaveBeenCalledTimes(1)
  })

  it('refreshes main locale after safe clear removes language settings', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers } = registerHandlers({ refreshMainLocale })

    await handlers.get('store-clear-safe')?.({}, ['geminiApiKey'])

    expect(refreshMainLocale).toHaveBeenCalledTimes(1)
  })

  it('does not refresh main locale after safe clear preserves both language settings', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers } = registerHandlers({ refreshMainLocale })

    await handlers.get('store-clear-safe')?.({}, ['language', 'languageManual'])

    expect(refreshMainLocale).not.toHaveBeenCalled()
  })

  it('does not refresh main locale for unrelated settings writes', async () => {
    const refreshMainLocale = vi.fn()
    const { handlers } = registerHandlers({ refreshMainLocale })

    await handlers.get('store-set')?.({}, 'theme', 'dark')

    expect(refreshMainLocale).not.toHaveBeenCalled()
  })

  it('blocks renderer access to catalog local secret through generic store IPC', async () => {
    const { handlers, store } = registerHandlers()

    const getResult = await handlers.get('store-get')?.({}, OPENROUTER_CATALOG_LOCAL_SECRET_KEY)
    const setResult = await handlers.get('store-set')?.({}, OPENROUTER_CATALOG_LOCAL_SECRET_KEY, 'secret')
    const deleteResult = await handlers.get('store-delete')?.({}, OPENROUTER_CATALOG_LOCAL_SECRET_KEY)

    expect(getResult).toBeUndefined()
    expect(setResult).toBe(false)
    expect(deleteResult).toBe(false)
    expect(store.get).not.toHaveBeenCalledWith(OPENROUTER_CATALOG_LOCAL_SECRET_KEY)
    expect(store.set).not.toHaveBeenCalledWith(OPENROUTER_CATALOG_LOCAL_SECRET_KEY, 'secret')
    expect(store.delete).not.toHaveBeenCalledWith(OPENROUTER_CATALOG_LOCAL_SECRET_KEY)
  })

  it('blocks renderer generic store access to legacy credential-bearing keys after C4 filtering', async () => {
    const blockedKeys = [
      'openRouterApiKey',
      'openRouterBaseUrl',
      'openAIResponsesApiKey',
      'googleAIStudioApiKey',
      'anthropicApiKey',
      'deepSeekApiKey',
      'geminiApiKey',
      'apiKey',
      OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
    ] as const
    const { handlers, store } = registerHandlers({
      initialStore: Object.fromEntries(blockedKeys.map((key) => [key, `legacy-${key}`])),
    })

    for (const key of blockedKeys) {
      const value = await handlers.get('store-get')?.({}, key)
      const setResult = await handlers.get('store-set')?.({}, key, `updated-${key}`)
      const deleteResult = await handlers.get('store-delete')?.({}, key)

      expect(value).toBeUndefined()
      expect(setResult).toBe(false)
      expect(deleteResult).toBe(false)
      expect(store.get).not.toHaveBeenCalledWith(key)
      expect(store.set).not.toHaveBeenCalledWith(key, `updated-${key}`)
      expect(store.delete).not.toHaveBeenCalledWith(key)
    }
  })

  it('keeps activeProvider and non-sensitive settings available through generic store IPC', async () => {
    const { handlers, store } = registerHandlers({
      initialStore: {
        activeProvider: 'OpenRouter',
        theme: 'dark',
      },
    })

    expect(await handlers.get('store-get')?.({}, 'activeProvider')).toBe('OpenRouter')
    expect(await handlers.get('store-set')?.({}, 'activeProvider', 'OpenRouter')).toBe(true)
    expect(await handlers.get('store-delete')?.({}, 'activeProvider')).toBe(true)
    expect(await handlers.get('store-get')?.({}, 'theme')).toBe('dark')
    expect(await handlers.get('store-set')?.({}, 'theme', 'light')).toBe(true)
    expect(await handlers.get('store-delete')?.({}, 'theme')).toBe(true)
    expect(store.get).toHaveBeenCalledWith('activeProvider')
    expect(store.set).toHaveBeenCalledWith('activeProvider', 'OpenRouter')
    expect(store.delete).toHaveBeenCalledWith('activeProvider')
  })

  it('characterizes preload as still exposing generic renderer store bridge methods', () => {
    const preloadSource = readFileSync(resolve(testDir, '..', 'preload.ts'), 'utf8')

    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('electronStore'")
    expect(preloadSource).toContain("get: (key: string) => ipcRenderer.invoke('store-get', key)")
    expect(preloadSource).toContain("set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value)")
    expect(preloadSource).toContain("delete: (key: string) => ipcRenderer.invoke('store-delete', key)")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openRouterCredential'")
    expect(preloadSource).not.toContain('credentialRef')
  })

  it('preserves credential-bearing keys during renderer safe clear by default', async () => {
    const { handlers } = registerHandlers()

    await handlers.get('store-clear-safe')?.({}, [])

    expect(vi.mocked(safeClearConfig)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS])
    )
  })

  it('preserves credential-bearing keys during renderer safe clear with a narrow keep list', async () => {
    vi.mocked(safeClearConfig).mockClear()
    const { handlers } = registerHandlers()

    await handlers.get('store-clear-safe')?.({}, ['language'])

    const keepKeys = vi.mocked(safeClearConfig).mock.calls.at(-1)?.[1] ?? []
    expect(keepKeys).toEqual(expect.arrayContaining([
      'language',
      ...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS,
    ]))
    expect(keepKeys).not.toContain('theme')
    expect(keepKeys).not.toContain('activeProvider')
  })

  it('keeps explicit credential keep keys deduplicated while preserving all blocked credential keys', async () => {
    vi.mocked(safeClearConfig).mockClear()
    const { handlers } = registerHandlers()

    await handlers.get('store-clear-safe')?.({}, ['openRouterApiKey', 'openRouterBaseUrl'])

    const keepKeys = vi.mocked(safeClearConfig).mock.calls.at(-1)?.[1] ?? []
    expect(keepKeys).toEqual(expect.arrayContaining([...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS]))
    expect(keepKeys.filter((key) => key === 'openRouterApiKey')).toHaveLength(1)
    expect(keepKeys.filter((key) => key === 'openRouterBaseUrl')).toHaveLength(1)
  })
})
