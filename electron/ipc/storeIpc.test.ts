import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { safeClearConfig } from '../config/configSchema'
import { OPENROUTER_CATALOG_LOCAL_SECRET_KEY } from '../modelCatalog/catalogScope'
import { providerCredentialSecureStoreKeys } from '../credentials/providerCredentialService'
import {
  COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
  COMPATIBLE_CREDENTIAL_SECURE_STORE_NAMESPACE,
  COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT,
} from '../credentials/compatibleCredentialService'
import { registerStoreIpc, RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS } from './storeIpc'

vi.mock('../config/configSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/configSchema')>()
  return {
    ...actual,
    safeClearConfig: vi.fn(() => 'config.backup.json'),
  }
})

const testDir = dirname(fileURLToPath(import.meta.url))

function getDotPath(root: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, root)
}

function setDotPath(root: Record<string, unknown>, key: string, value: unknown): void {
  const segments = key.split('.')
  let current = root
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object') current[segment] = {}
    current = current[segment] as Record<string, unknown>
  }
  current[segments.at(-1)!] = value
}

function deleteDotPath(root: Record<string, unknown>, key: string): void {
  const segments = key.split('.')
  const parent = getDotPath(root, segments.slice(0, -1).join('.'))
  if (parent && typeof parent === 'object') delete (parent as Record<string, unknown>)[segments.at(-1)!]
}

function registerHandlers(input?: { refreshMainLocale?: () => void; initialStore?: Record<string, unknown> }) {
  const registerInvoke = vi.fn()
  const storeData: Record<string, unknown> = { language: 'en-US', languageManual: 'en-US' }
  for (const [key, value] of Object.entries(input?.initialStore ?? {})) setDotPath(storeData, key, value)
  const store = {
    store: storeData,
    get: vi.fn((key: string) => getDotPath(storeData, key)),
    set: vi.fn((key: string, value: unknown) => setDotPath(storeData, key, value)),
    delete: vi.fn((key: string) => deleteDotPath(storeData, key)),
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
      'openAIResponsesApiKey',
      'googleAIStudioApiKey',
      'anthropicApiKey',
      'deepSeekApiKey',
      'geminiApiKey',
      'apiKey',
      OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
      ...providerCredentialSecureStoreKeys(),
      `${COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX}ocp_credential_12345678`,
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

  it('blocks credential namespace ancestors and descendants under electron-store dot notation', async () => {
    const { handlers, store } = registerHandlers()
    const blockedPaths = [
      COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT,
      COMPATIBLE_CREDENTIAL_SECURE_STORE_NAMESPACE,
      `${COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX}ocp_credential_12345678`,
      `${COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX}ocp_credential_12345678.ciphertextBase64`,
      'providerCredentials',
      'providerCredentials.v1',
      'providerCredentials.v1.future-provider',
    ]

    for (const key of blockedPaths) {
      expect(await handlers.get('store-get')?.({}, key)).toBeUndefined()
      expect(await handlers.get('store-set')?.({}, key, 'tamper')).toBe(false)
      expect(await handlers.get('store-delete')?.({}, key)).toBe(false)
      expect(store.get).not.toHaveBeenCalledWith(key)
      expect(store.set).not.toHaveBeenCalledWith(key, 'tamper')
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
    const compatibleKey = `${COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX}ocp_credential_12345678`
    const { handlers } = registerHandlers({ initialStore: { [compatibleKey]: { ciphertextBase64: 'encrypted' } } })

    await handlers.get('store-clear-safe')?.({}, [])

    expect(vi.mocked(safeClearConfig)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS, 'providerCredentials', COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT])
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
      'providerCredentials',
      COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT,
    ]))
    expect(keepKeys).not.toContain('theme')
    expect(keepKeys).not.toContain('activeProvider')
  })

  it('keeps explicit credential keep keys deduplicated while preserving all blocked credential keys', async () => {
    vi.mocked(safeClearConfig).mockClear()
    const { handlers } = registerHandlers()

    await handlers.get('store-clear-safe')?.({}, ['openRouterApiKey'])

    const keepKeys = vi.mocked(safeClearConfig).mock.calls.at(-1)?.[1] ?? []
    expect(keepKeys).toEqual(expect.arrayContaining([
      ...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS,
      'providerCredentials',
      COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT,
    ]))
    expect(keepKeys.filter((key) => key === 'openRouterApiKey')).toHaveLength(1)
  })
})
