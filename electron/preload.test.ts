import { afterEach, describe, expect, it, vi } from 'vitest'

describe('preload scoped API exposure', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unmock('electron')
  })

  it('does not expose raw ipcRenderer to the renderer world', async () => {
    const exposeInMainWorld = vi.fn()
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    }))

    await import('./preload')

    const exposedNames = exposeInMainWorld.mock.calls.map(([name]) => name)
    expect(exposedNames).not.toContain('ipcRenderer')
    expect(exposedNames).toEqual(expect.arrayContaining([
      'electronStore',
      'openRouterCredential',
      'electronAPI',
      'dbBridge',
    ]))
    const electronApi = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronAPI')?.[1]
    expect(electronApi).toEqual(expect.objectContaining({
      selectImage: expect.any(Function),
      copyImageToClipboard: expect.any(Function),
      resolveImagePath: expect.any(Function),
      exportImage: expect.any(Function),
      getNetExpRuntimeInfo: expect.any(Function),
      startOpenRouterStream: expect.any(Function),
      abortOpenRouterStream: expect.any(Function),
      onOpenRouterChunk: expect.any(Function),
      onOpenRouterEnd: expect.any(Function),
      onModelCatalogSynced: expect.any(Function),
      modelCatalogRepairCurrentScopedCache: expect.any(Function),
      modelCatalogClearCurrentScopedCache: expect.any(Function),
      modelCatalogClearAllOpenRouterScopedCaches: expect.any(Function),
    }))
  })

  it('exposes generic store bridge for non-sensitive settings and narrow OpenRouter credential bridge', async () => {
    const invoke = vi.fn()
    const exposeInMainWorld = vi.fn()
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: {
        invoke,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    }))

    await import('./preload')

    const electronStore = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronStore')?.[1]
    const openRouterCredential = exposeInMainWorld.mock.calls.find(([name]) => name === 'openRouterCredential')?.[1]
    expect(electronStore).toEqual(expect.objectContaining({
      get: expect.any(Function),
      set: expect.any(Function),
      delete: expect.any(Function),
      clearSafe: expect.any(Function),
      checkIntegrity: expect.any(Function),
    }))
    expect(openRouterCredential).toEqual({
      getStatus: expect.any(Function),
      update: expect.any(Function),
      clear: expect.any(Function),
    })

    await electronStore.get('theme')
    await electronStore.set('theme', 'dark')
    await electronStore.delete('theme')
    await electronStore.clearSafe(['language'])
    await electronStore.checkIntegrity()
    await openRouterCredential.getStatus()
    await openRouterCredential.update({ apiKey: 'raw-openrouter-key', baseUrl: 'https://openrouter.ai/api/v1' })
    await openRouterCredential.clear()

    expect(invoke).toHaveBeenCalledWith('store-get', 'theme')
    expect(invoke).toHaveBeenCalledWith('store-set', 'theme', 'dark')
    expect(invoke).toHaveBeenCalledWith('store-delete', 'theme')
    expect(invoke).toHaveBeenCalledWith('store-clear-safe', ['language'])
    expect(invoke).toHaveBeenCalledWith('store-check-integrity')
    expect(invoke).toHaveBeenCalledWith('openrouter-credential:get-status')
    expect(invoke).toHaveBeenCalledWith('openrouter-credential:update', {
      apiKey: 'raw-openrouter-key',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    expect(invoke).toHaveBeenCalledWith('openrouter-credential:clear')
  })
})
