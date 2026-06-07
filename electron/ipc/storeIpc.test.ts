import { describe, expect, it, vi } from 'vitest'
import { safeClearConfig } from '../config/configSchema'
import { OPENROUTER_CATALOG_LOCAL_SECRET_KEY } from '../modelCatalog/catalogScope'
import { registerStoreIpc } from './storeIpc'

vi.mock('../config/configSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/configSchema')>()
  return {
    ...actual,
    safeClearConfig: vi.fn(() => 'config.backup.json'),
  }
})

function registerHandlers(input?: { refreshMainLocale?: () => void }) {
  const registerInvoke = vi.fn()
  const store = {
    store: { language: 'en-US', languageManual: 'en-US' },
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
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

  it('preserves catalog local secret during renderer safe clear', async () => {
    const { handlers } = registerHandlers()

    await handlers.get('store-clear-safe')?.({}, ['language'])

    expect(vi.mocked(safeClearConfig)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['language', OPENROUTER_CATALOG_LOCAL_SECRET_KEY])
    )
  })
})
