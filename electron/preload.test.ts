import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))

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
      'openAIResponsesCredential',
      'localEndpointDiagnostics',
      'localEndpointChat',
      'openAIResponsesChat',
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
    const openAIResponsesCredential = exposeInMainWorld.mock.calls.find(([name]) => name === 'openAIResponsesCredential')?.[1]
    const localEndpointDiagnostics = exposeInMainWorld.mock.calls.find(([name]) => name === 'localEndpointDiagnostics')?.[1]
    const localEndpointChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'localEndpointChat')?.[1]
    const openAIResponsesChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'openAIResponsesChat')?.[1]
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
    expect(openAIResponsesCredential).toEqual({
      getStatus: expect.any(Function),
      update: expect.any(Function),
      clear: expect.any(Function),
    })
    expect(localEndpointDiagnostics).toEqual({
      probe: expect.any(Function),
      streamProbe: expect.any(Function),
    })
    expect(localEndpointChat).toEqual({
      startTextChat: expect.any(Function),
      abortTextChat: expect.any(Function),
      onTextChatChunk: expect.any(Function),
      onTextChatEnd: expect.any(Function),
    })
    expect(openAIResponsesChat).toEqual({
      startTextChat: expect.any(Function),
      abortTextChat: expect.any(Function),
      onTextChatChunk: expect.any(Function),
      onTextChatEnd: expect.any(Function),
    })
    expect(localEndpointDiagnostics.getStatus).toBeUndefined()
    expect(localEndpointDiagnostics.update).toBeUndefined()
    expect(localEndpointDiagnostics.endpointRegistry).toBeUndefined()
    expect(localEndpointChat.getStatus).toBeUndefined()
    expect(localEndpointChat.update).toBeUndefined()
    expect(localEndpointChat.endpointRegistry).toBeUndefined()
    expect(openAIResponsesCredential.apiKey).toBeUndefined()
    expect(openAIResponsesCredential.endpointRegistry).toBeUndefined()
    expect(openAIResponsesChat.getStatus).toBeUndefined()
    expect(openAIResponsesChat.update).toBeUndefined()
    expect(openAIResponsesChat.endpointRegistry).toBeUndefined()
    expect(openRouterCredential.getEndpointMetadata).toBeUndefined()
    expect(openRouterCredential.endpointRegistry).toBeUndefined()

    await electronStore.get('theme')
    await electronStore.set('theme', 'dark')
    await electronStore.delete('theme')
    await electronStore.clearSafe(['language'])
    await electronStore.checkIntegrity()
    await openRouterCredential.getStatus()
    await openRouterCredential.update({ apiKey: 'raw-openrouter-key', baseUrl: 'https://openrouter.ai/api/v1' })
    await openRouterCredential.clear()
    await openAIResponsesCredential.getStatus()
    await openAIResponsesCredential.update({ apiKey: 'raw-openai-key' })
    await openAIResponsesCredential.clear()
    await localEndpointDiagnostics.probe({ url: 'http://localhost:1234', timeoutMs: 5000 })
    await localEndpointDiagnostics.streamProbe({ url: 'http://localhost:1234', timeoutMs: 5000 })
    await localEndpointChat.startTextChat({
      requestId: 'local_req_preload',
      url: 'http://localhost:1234/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await localEndpointChat.abortTextChat('local_req_preload')
    localEndpointChat.onTextChatChunk('local_req_preload', () => {})
    localEndpointChat.onTextChatEnd('local_req_preload', () => {})
    await openAIResponsesChat.startTextChat({
      requestId: 'openai_responses_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await openAIResponsesChat.abortTextChat('openai_responses_req_preload')
    openAIResponsesChat.onTextChatChunk('openai_responses_req_preload', () => {})
    openAIResponsesChat.onTextChatEnd('openai_responses_req_preload', () => {})

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
    expect(invoke).toHaveBeenCalledWith('openai-responses-credential:get-status')
    expect(invoke).toHaveBeenCalledWith('openai-responses-credential:update', {
      apiKey: 'raw-openai-key',
    })
    expect(invoke).toHaveBeenCalledWith('openai-responses-credential:clear')
    expect(invoke).toHaveBeenCalledWith('local-endpoint-diagnostics:probe', {
      url: 'http://localhost:1234',
      timeoutMs: 5000,
    })
    expect(invoke).toHaveBeenCalledWith('local-endpoint-diagnostics:stream-probe', {
      url: 'http://localhost:1234',
      timeoutMs: 5000,
    })
    expect(invoke).toHaveBeenCalledWith('local-endpoint-chat:stream-text', {
      requestId: 'local_req_preload',
      url: 'http://localhost:1234/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(invoke).toHaveBeenCalledWith('local-endpoint-chat:abort', 'local_req_preload')
    expect(invoke).toHaveBeenCalledWith('openai-responses-chat:stream-text', {
      requestId: 'openai_responses_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(invoke).toHaveBeenCalledWith('openai-responses-chat:abort', 'openai_responses_req_preload')
  })

  it('does not expose generic credential resolver or raw Authorization/Bearer helpers', () => {
    const preloadSource = readFileSync(resolve(testDir, 'preload.ts'), 'utf8')

    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openRouterCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('localEndpointDiagnostics'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('localEndpointChat'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesChat'")
    expect(preloadSource).not.toContain('credentialRef')
    expect(preloadSource).not.toContain('credentialResolver')
    expect(preloadSource).not.toContain('secretStore')
    expect(preloadSource).not.toContain('EndpointRegistry')
    expect(preloadSource).not.toContain('ProviderRegistry')
    expect(preloadSource).not.toContain('endpointRegistry')
    expect(preloadSource).not.toContain('providerRegistry')
    expect(preloadSource).not.toContain('Authorization')
    expect(preloadSource).not.toContain('Bearer')
    expect(preloadSource).not.toContain('openRouterApiKey')
    expect(preloadSource).not.toContain('openRouterBaseUrl')
  })
})
