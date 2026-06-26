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
      'openAIResponsesModels',
      'googleAIStudioCredential',
      'anthropicCredential',
      'anthropicModels',
      'deepSeekCredential',
      'deepSeekModels',
      'googleAIStudioModels',
      'localEndpointDiagnostics',
      'localEndpointChat',
      'openAIResponsesChat',
      'googleAIStudioChat',
      'anthropicChat',
      'deepSeekChat',
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
    const openAIResponsesModels = exposeInMainWorld.mock.calls.find(([name]) => name === 'openAIResponsesModels')?.[1]
    const googleAIStudioCredential = exposeInMainWorld.mock.calls.find(([name]) => name === 'googleAIStudioCredential')?.[1]
    const anthropicCredential = exposeInMainWorld.mock.calls.find(([name]) => name === 'anthropicCredential')?.[1]
    const anthropicModels = exposeInMainWorld.mock.calls.find(([name]) => name === 'anthropicModels')?.[1]
    const deepSeekCredential = exposeInMainWorld.mock.calls.find(([name]) => name === 'deepSeekCredential')?.[1]
    const deepSeekModels = exposeInMainWorld.mock.calls.find(([name]) => name === 'deepSeekModels')?.[1]
    const googleAIStudioModels = exposeInMainWorld.mock.calls.find(([name]) => name === 'googleAIStudioModels')?.[1]
    const localEndpointDiagnostics = exposeInMainWorld.mock.calls.find(([name]) => name === 'localEndpointDiagnostics')?.[1]
    const localEndpointChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'localEndpointChat')?.[1]
    const openAIResponsesChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'openAIResponsesChat')?.[1]
    const googleAIStudioChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'googleAIStudioChat')?.[1]
    const anthropicChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'anthropicChat')?.[1]
    const deepSeekChat = exposeInMainWorld.mock.calls.find(([name]) => name === 'deepSeekChat')?.[1]
    const electronApi = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronAPI')?.[1]
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
    expect(openAIResponsesModels).toEqual({
      listAvailability: expect.any(Function),
    })
    expect(googleAIStudioCredential).toEqual({
      getStatus: expect.any(Function),
      update: expect.any(Function),
      clear: expect.any(Function),
    })
    expect(anthropicCredential).toEqual({
      getStatus: expect.any(Function),
      update: expect.any(Function),
      clear: expect.any(Function),
    })
    expect(anthropicModels).toEqual({
      listAvailability: expect.any(Function),
    })
    expect(deepSeekCredential).toEqual({
      getStatus: expect.any(Function),
      update: expect.any(Function),
      clear: expect.any(Function),
    })
    expect(deepSeekModels).toEqual({
      listAvailability: expect.any(Function),
    })
    expect(googleAIStudioModels).toEqual({
      listAvailability: expect.any(Function),
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
    expect(googleAIStudioChat).toEqual({
      startTextChat: expect.any(Function),
      abortTextChat: expect.any(Function),
      onTextChatChunk: expect.any(Function),
      onTextChatEnd: expect.any(Function),
    })
    expect(anthropicChat).toEqual({
      startTextChat: expect.any(Function),
      abortTextChat: expect.any(Function),
      onTextChatChunk: expect.any(Function),
      onTextChatEnd: expect.any(Function),
    })
    expect(deepSeekChat).toEqual({
      startTextChat: expect.any(Function),
      abortTextChat: expect.any(Function),
      onTextChatChunk: expect.any(Function),
      onTextChatEnd: expect.any(Function),
    })
    expect(electronApi).toEqual(expect.objectContaining({
      importLibreOfficeSvpkg: expect.any(Function),
      quarantineLibreOfficeRuntime: expect.any(Function),
    }))
    expect(localEndpointDiagnostics.getStatus).toBeUndefined()
    expect(localEndpointDiagnostics.update).toBeUndefined()
    expect(localEndpointDiagnostics.endpointRegistry).toBeUndefined()
    expect(localEndpointChat.getStatus).toBeUndefined()
    expect(localEndpointChat.update).toBeUndefined()
    expect(localEndpointChat.endpointRegistry).toBeUndefined()
    expect(openAIResponsesCredential.apiKey).toBeUndefined()
    expect(openAIResponsesCredential.endpointRegistry).toBeUndefined()
    expect(openAIResponsesModels.apiKey).toBeUndefined()
    expect(openAIResponsesModels.update).toBeUndefined()
    expect(openAIResponsesModels.endpointRegistry).toBeUndefined()
    expect(googleAIStudioCredential.apiKey).toBeUndefined()
    expect(googleAIStudioCredential.endpointRegistry).toBeUndefined()
    expect(anthropicCredential.apiKey).toBeUndefined()
    expect(anthropicCredential.endpointRegistry).toBeUndefined()
    expect(anthropicModels.apiKey).toBeUndefined()
    expect(anthropicModels.update).toBeUndefined()
    expect(anthropicModels.endpointRegistry).toBeUndefined()
    expect(deepSeekCredential.apiKey).toBeUndefined()
    expect(deepSeekCredential.endpointRegistry).toBeUndefined()
    expect(deepSeekModels.apiKey).toBeUndefined()
    expect(deepSeekModels.update).toBeUndefined()
    expect(deepSeekModels.endpointRegistry).toBeUndefined()
    expect(googleAIStudioModels.apiKey).toBeUndefined()
    expect(googleAIStudioModels.update).toBeUndefined()
    expect(googleAIStudioModels.endpointRegistry).toBeUndefined()
    expect(openAIResponsesChat.getStatus).toBeUndefined()
    expect(openAIResponsesChat.update).toBeUndefined()
    expect(openAIResponsesChat.endpointRegistry).toBeUndefined()
    expect(googleAIStudioChat.getStatus).toBeUndefined()
    expect(googleAIStudioChat.update).toBeUndefined()
    expect(googleAIStudioChat.endpointRegistry).toBeUndefined()
    expect(anthropicChat.getStatus).toBeUndefined()
    expect(anthropicChat.update).toBeUndefined()
    expect(anthropicChat.endpointRegistry).toBeUndefined()
    expect(deepSeekChat.getStatus).toBeUndefined()
    expect(deepSeekChat.update).toBeUndefined()
    expect(deepSeekChat.endpointRegistry).toBeUndefined()
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
    await openAIResponsesModels.listAvailability({ timeoutMs: 5000 })
    await googleAIStudioCredential.getStatus()
    await googleAIStudioCredential.update({ apiKey: 'raw-google-key' })
    await googleAIStudioCredential.clear()
    await anthropicCredential.getStatus()
    await anthropicCredential.update({ apiKey: 'raw-anthropic-key' })
    await anthropicCredential.clear()
    await anthropicModels.listAvailability({ timeoutMs: 5000 })
    await deepSeekCredential.getStatus()
    await deepSeekCredential.update({ apiKey: 'raw-deepseek-key' })
    await deepSeekCredential.clear()
    await deepSeekModels.listAvailability({ timeoutMs: 5000 })
    await googleAIStudioModels.listAvailability({ timeoutMs: 5000 })
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
    await googleAIStudioChat.startTextChat({
      requestId: 'google_ai_studio_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await googleAIStudioChat.abortTextChat('google_ai_studio_req_preload')
    googleAIStudioChat.onTextChatChunk('google_ai_studio_req_preload', () => {})
    googleAIStudioChat.onTextChatEnd('google_ai_studio_req_preload', () => {})
    await anthropicChat.startTextChat({
      requestId: 'anthropic_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await anthropicChat.abortTextChat('anthropic_req_preload')
    anthropicChat.onTextChatChunk('anthropic_req_preload', () => {})
    anthropicChat.onTextChatEnd('anthropic_req_preload', () => {})
    await deepSeekChat.startTextChat({
      requestId: 'deepseek_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await deepSeekChat.abortTextChat('deepseek_req_preload')
    deepSeekChat.onTextChatChunk('deepseek_req_preload', () => {})
    deepSeekChat.onTextChatEnd('deepseek_req_preload', () => {})
    await electronApi.importLibreOfficeSvpkg()
    await electronApi.quarantineLibreOfficeRuntime()

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
    expect(invoke).toHaveBeenCalledWith('openai-responses-models:list-availability', {
      timeoutMs: 5000,
    })
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-credential:get-status')
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-credential:update', {
      apiKey: 'raw-google-key',
    })
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-credential:clear')
    expect(invoke).toHaveBeenCalledWith('anthropic-credential:get-status')
    expect(invoke).toHaveBeenCalledWith('anthropic-credential:update', {
      apiKey: 'raw-anthropic-key',
    })
    expect(invoke).toHaveBeenCalledWith('anthropic-credential:clear')
    expect(invoke).toHaveBeenCalledWith('anthropic-models:list-availability', {
      timeoutMs: 5000,
    })
    expect(invoke).toHaveBeenCalledWith('deepseek-credential:get-status')
    expect(invoke).toHaveBeenCalledWith('deepseek-credential:update', {
      apiKey: 'raw-deepseek-key',
    })
    expect(invoke).toHaveBeenCalledWith('deepseek-credential:clear')
    expect(invoke).toHaveBeenCalledWith('deepseek-models:list-availability', {
      timeoutMs: 5000,
    })
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-models:list-availability', {
      timeoutMs: 5000,
    })
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
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-chat:stream-text', {
      requestId: 'google_ai_studio_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(invoke).toHaveBeenCalledWith('google-ai-studio-chat:abort', 'google_ai_studio_req_preload')
    expect(invoke).toHaveBeenCalledWith('anthropic-chat:stream-text', {
      requestId: 'anthropic_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(invoke).toHaveBeenCalledWith('anthropic-chat:abort', 'anthropic_req_preload')
    expect(invoke).toHaveBeenCalledWith('deepseek-chat:stream-text', {
      requestId: 'deepseek_req_preload',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(invoke).toHaveBeenCalledWith('deepseek-chat:abort', 'deepseek_req_preload')
    expect(invoke).toHaveBeenCalledWith('dialog:import-libreoffice-svpkg')
    expect(invoke).toHaveBeenCalledWith('dialog:quarantine-libreoffice-runtime')
  })

  it('does not expose generic credential resolver or raw Authorization/Bearer helpers', () => {
    const preloadSource = readFileSync(resolve(testDir, 'preload.ts'), 'utf8')

    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openRouterCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesModels'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('googleAIStudioCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('anthropicCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('anthropicModels'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('deepSeekCredential'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('deepSeekModels'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('googleAIStudioModels'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('localEndpointDiagnostics'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('localEndpointChat'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesChat'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('googleAIStudioChat'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('anthropicChat'")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('deepSeekChat'")
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
