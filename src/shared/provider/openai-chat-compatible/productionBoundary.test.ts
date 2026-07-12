import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DB_METHODS, DB_RENDERER_METHOD_SET } from '../../../../infra/db/dbMethodsRegistry'

const read = (...segments: string[]) => readFileSync(path.resolve(process.cwd(), ...segments), 'utf8')

describe('OpenAI Chat Completions-compatible production boundary', () => {
  it('routes compatible configuration selections through the unified renderer send coordinator and canonical chat bridge', () => {
    const runtimeSelection = read('src', 'next', 'provider', 'runtimeSelection.ts')
    const appLogic = read('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const preload = read('electron', 'preload.ts')

    expect(runtimeSelection).not.toContain('openai_chat_compatible')
    expect(appLogic).toContain('resolveUnifiedRuntimeDispatch')
    expect(appLogic).toContain("kind: 'compatible' as const")
    expect(appLogic).not.toContain('onCompatibleSend')
    expect(appLogic).toContain('window.compatibleChat')
    expect(appLogic).not.toContain('compatibleProviderRepo')
    const appView = read('src', 'ui-app', 'AppChatApp.vue')
    expect(appView).not.toContain('onCompatibleSend')
    expect(appView).toContain('@send="onComposerSend"')
    expect(appView).toContain('void onSend()')
    expect(preload).toContain("ipcRenderer.invoke('compatible-chat:start'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-chat:abort'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-chat:resolve-historical'")
    const compatibleExposureNames = [...preload.matchAll(/contextBridge\.exposeInMainWorld\('(?<name>compatible[^']+)'/g)]
      .map((match) => match.groups?.name ?? '')
    expect(compatibleExposureNames).toEqual(expect.arrayContaining(['compatibleProviderRegistry', 'compatibleProviderTransport', 'compatibleCatalog', 'compatibleChat']))
  })

  it('exposes only read-only provider-neutral projection methods to the renderer DB bridge', () => {
    const methods = DB_METHODS.filter((entry) => entry.name.startsWith('compatible'))
    const rendererProjectionMethods = new Set(['compatibleProjection.loadChoice', 'compatibleProjection.loadRoute', 'compatibleProjection.loadBundle'])
    expect(methods.length).toBeGreaterThan(0)
    expect(methods.every((entry) => entry.worker && entry.renderer === rendererProjectionMethods.has(entry.name))).toBe(true)
    for (const method of methods) expect(DB_RENDERER_METHOD_SET.has(method.name)).toBe(rendererProjectionMethods.has(method.name))
  })

  it('contains no transport primitive in canonical domain or repositories', () => {
    const files = [
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'identity.ts'],
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'schemas.ts'],
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'domain.ts'],
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'rendererSafe.ts'],
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'repositoryContracts.ts'],
      ['src', 'shared', 'provider', 'openai-chat-compatible', 'registry', 'registrySchemas.ts'],
      ['electron', 'credentials', 'compatibleCredentialService.ts'],
      ['electron', 'ipc', 'compatibleProviderRegistryIpc.ts'],
      ['electron', 'services', 'compatibleRouteCoordinator.ts'],
      ['infra', 'db', 'repo', 'compatibleProviderRepo.ts'],
      ['infra', 'db', 'repo', 'compatibleProfileRepo.ts'],
      ['infra', 'db', 'repo', 'compatibleCatalogRepo.ts'],
      ['infra', 'db', 'repo', 'compatibleRouteRepo.ts'],
      ['infra', 'db', 'repo', 'compatibleDiagnosticsRepo.ts'],
    ]
    const source = files.map((segments) => read(...segments)).join('\n')
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/session\.fetch|net\.request|XMLHttpRequest/)
  })

  it('exposes no compatible credential reveal or secret-bearing diagnostic channel', () => {
    const preload = read('electron', 'preload.ts')
    const registryIpc = read('electron', 'ipc', 'compatibleProviderRegistryIpc.ts')
    const source = `${preload}\n${registryIpc}`

    expect(source).not.toMatch(/compatible-provider:(?:reveal|send|stream|probe)/)
    expect(registryIpc).not.toMatch(/console\.(?:log|warn|error)/)
    expect(registryIpc).not.toMatch(/JSON\.stringify\(error/)
  })

  it('exposes one typed compatible chat operation and wires lifecycle cleanup in main', () => {
    const preload = read('electron', 'preload.ts')
    const transportIpc = read('electron', 'ipc', 'compatibleProviderTransportIpc.ts')
    const main = read('electron', 'main.ts')
    expect(preload).toContain("ipcRenderer.invoke('compatible-provider:test-connection'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-provider:abort-connection-test'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-catalog:sync'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-catalog:query'")
    expect(preload).toContain("ipcRenderer.invoke('compatible-chat:start'")
    expect(preload).not.toMatch(/compatible-provider:(?:chat|send|stream|fetch)/iu)
    expect(transportIpc).not.toMatch(/baseUrl|headers|credential|query|body/iu)
    expect(main).toContain('createCompatibleProviderTransportService')
    expect(main).toContain('createCompatibleChatRuntimeService')
    expect(main).toContain('compatibleProviderTransportService?.abortAll()')
    expect(main).toContain('compatibleChatRuntimeService?.abortAll()')
    expect(main.indexOf('compatibleProviderTransportService?.abortAll()')).toBeLessThan(main.indexOf('await dbWorkerManager.stop()'))
  })

  it('keeps compatible catalog identity and egress independent from native/OpenRouter/LocalEndpoint catalog paths', () => {
    const sync = read('electron', 'modelCatalog', 'compatibleCatalogSyncJob.ts')
    const ipc = read('electron', 'ipc', 'compatibleCatalogIpc.ts')
    const client = read('src', 'next', 'modelCatalog', 'compatibleCatalogClient.ts')
    const source = `${sync}\n${ipc}\n${client}`
    expect(source).not.toMatch(/providerCatalogSyncJob|providerCatalogScopeResolver|modelCatalogSyncIpc|LocalEndpoint|openrouter/iu)
    expect(source).not.toMatch(/compatible-(?:catalog|provider):(?:chat|send|stream|fetch)/iu)
    expect(sync).toContain("operation: 'models'")
    expect(sync).toContain('input.transport.request')
    expect(client).toContain('providerInstanceId')
  })

  it('keeps the canonical request builder pure and independent from native or legacy builders', () => {
    const request = [
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'request', 'messageTypes.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'request', 'fieldOwnership.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'request', 'buildCompatibleChatRequest.ts'),
    ].join('\n')
    expect(request).not.toMatch(/openrouter|openai-responses|deepseek|anthropic|gemini|LocalEndpoint|lmStudio|ollama/iu)
    expect(request).not.toMatch(/\bfetch\s*\(|session\.fetch|net\.request|ipcRenderer|ipcMain/iu)
    const runtime = read('electron', 'services', 'compatibleChatRuntimeService.ts')
    expect(runtime).toContain('buildCompatibleChatRequest')
    expect(runtime).not.toMatch(/openrouter|openai-responses|deepseek|LocalEndpoint|ollama/iu)
  })

  it('keeps the compatible wire parser pure and uses it from the canonical runtime', () => {
    const wire = [
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'wireTypes.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'wireError.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'sseFramer.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'semanticDecoder.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'semanticMapper.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'streamParser.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'nonStreamDecoder.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'wire', 'httpErrorMapper.ts'),
    ].join('\n')
    expect(wire).not.toMatch(/openrouter|openai-responses|deepseek|anthropic|gemini|LocalEndpoint|lmStudio|ollama/iu)
    expect(wire).not.toMatch(/\bfetch\s*\(|session\.fetch|net\.request|ipcRenderer|ipcMain|compatibleRoute|compatibleCatalog|sqlite|better-sqlite3/iu)
    const runtime = read('electron', 'services', 'compatibleChatRuntimeService.ts')
    expect(runtime).toContain('CompatibleSseWireParser')
    expect(runtime).toContain('decodeCompatibleNonStreamResponse')
  })

  it('keeps compatible tool aggregation observe-only and structured', () => {
    const tools = [
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'tools', 'toolTypes.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'tools', 'toolAccumulator.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'tools', 'toolViewModel.ts'),
      read('src', 'shared', 'provider', 'openai-chat-compatible', 'tools', 'toolContextReconstruction.ts'),
      read('infra', 'db', 'repo', 'compatibleToolRepo.ts'),
    ].join('\n')
    expect(tools).not.toMatch(/openrouter|openai-responses|deepseek|anthropic|gemini|LocalEndpoint|lmStudio|ollama/iu)
    expect(tools).not.toMatch(/\bfetch\s*\(|session\.fetch|net\.request|ipcRenderer|ipcMain/iu)
    expect(tools).not.toMatch(/executeTool|toolExecutor|functionRegistry|pluginHost|child_process|node:vm|eval\s*\(|new Function/iu)
    expect(read('electron', 'preload.ts')).not.toMatch(/compatible-(?:provider|tool):execute/iu)
    const methodSource = read('infra', 'db', 'dbMethodsRegistry.ts')
    expect(methodSource).not.toContain('compatibleRoute.upsertToolCall')
    expect(methodSource).not.toContain('compatibleRoute.createToolResult')
    for (const method of DB_METHODS.filter((entry) => entry.name.startsWith('compatibleTool.'))) {
      expect(method.worker).toBe(true)
      expect(method.renderer).toBe(false)
    }
  })

  it('surfaces credential reconciliation failures without logging refs or payloads', () => {
    const main = read('electron', 'main.ts')
    expect(main).toContain('reconciliation.cleanupFailed > 0 || reconciliation.missingActive > 0')
    expect(main).toContain('compatible credential reconciliation requires attention')
  })

  it('keeps composite route preparation worker-only and removes bypass primitives', () => {
    const names = DB_METHODS.map((entry) => entry.name)
    expect(names).toContain('compatibleRoute.prepareTurn')
    expect(names).not.toContain('compatibleRoute.create')
    expect(names).not.toContain('compatibleRoute.addChoice')
    expect(DB_RENDERER_METHOD_SET.has('compatibleRoute.prepareTurn')).toBe(false)
    expect(read('electron', 'preload.ts')).not.toContain('compatibleRoute')
    expect(read('electron', 'main.ts')).toContain("dbWorkerManager.call('compatibleRoute.recoverIncomplete'")
  })
})
