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

  it('characterizes electronStore as a generic legacy store bridge before C4 filtering', async () => {
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
    expect(electronStore).toEqual(expect.objectContaining({
      get: expect.any(Function),
      set: expect.any(Function),
      delete: expect.any(Function),
      clearSafe: expect.any(Function),
      checkIntegrity: expect.any(Function),
    }))

    await electronStore.get('openRouterApiKey')
    await electronStore.set('openRouterApiKey', 'raw-openrouter-key')
    await electronStore.delete('openRouterApiKey')
    await electronStore.clearSafe(['language'])
    await electronStore.checkIntegrity()

    expect(invoke).toHaveBeenCalledWith('store-get', 'openRouterApiKey')
    expect(invoke).toHaveBeenCalledWith('store-set', 'openRouterApiKey', 'raw-openrouter-key')
    expect(invoke).toHaveBeenCalledWith('store-delete', 'openRouterApiKey')
    expect(invoke).toHaveBeenCalledWith('store-clear-safe', ['language'])
    expect(invoke).toHaveBeenCalledWith('store-check-integrity')
  })
})
