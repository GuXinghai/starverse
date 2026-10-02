import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1, GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED } from
  '../src/next/generation-v2/model-facts/semanticInvalidationV1'

describe('Generation V2 preload boundary', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unmock('electron')
  })

  async function load(argv = process.argv) {
    const invoke = vi.fn()
    const exposeInMainWorld = vi.fn()
    const on = vi.fn()
    const removeListener = vi.fn()
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke, on, removeListener },
    }))
    const previousArgv = process.argv
    Object.defineProperty(process, 'argv', { configurable: true, value: argv })
    try { await import('./preload') } finally { Object.defineProperty(process, 'argv', { configurable: true, value: previousArgv }) }
    return { invoke, exposeInMainWorld, on, removeListener }
  }

  it('exposes only the retained shell/settings surfaces plus one Generation V2 namespace', async () => {
    const { exposeInMainWorld } = await load()
    const names = exposeInMainWorld.mock.calls.map(([name]) => name)
    expect(names).toEqual([
      'electronStore',
      'rawGenerationDebug',
      'networkProxy',
      'generationV2',
      'electronAPI',
    ])
    expect(names).not.toEqual(expect.arrayContaining([
      'ipcRenderer', 'dbBridge', 'compatibleChat', 'compatibleProviderRegistry',
      'compatibleProviderTransport', 'compatibleCatalog', 'openRouterCredential',
      'localEndpointDiagnostics', 'lmStudioProvider', 'ollamaProvider',
    ]))

    const electronApi = exposeInMainWorld.mock.calls.find(([name]) => name === 'electronAPI')?.[1]
    expect(electronApi).toEqual(expect.objectContaining({
      selectLocalFiles: expect.any(Function),
      importLibreOfficeSvpkg: expect.any(Function),
      openImage: expect.any(Function),
      openExternal: expect.any(Function),
      openInAppLink: expect.any(Function),
    }))
    expect(electronApi).not.toEqual(expect.objectContaining({
      startOpenRouterStream: expect.any(Function),
      modelCatalogSyncNow: expect.any(Function),
      getNetExpRuntimeInfo: expect.any(Function),
    }))
  })

  it('exposes the fixture grant bridge only when the explicit smoke authority flag is set', async () => {
    const previous = process.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY
    process.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY = '1'
    try {
      const { invoke, exposeInMainWorld } = await load([...process.argv, '--user-data-dir=C:/tmp/starverse-smoke'])
      const generationV2 = exposeInMainWorld.mock.calls.find(([name]) => name === 'generationV2')?.[1]
      await generationV2.smokeFixture.requestLocalFileGrant('docx')
      expect(invoke).toHaveBeenCalledWith('generation-v2:smoke-fixture:request-local-file-grant', { fixtureName: 'docx' })
    } finally {
      if (previous === undefined) delete process.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY
      else process.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY = previous
    }
  })

  it('does not expose the packaged DOCX fixture bridge by default, and exposes only the fixed grant action under the full test gate', async () => {
    const keys = ['NODE_ENV', 'SV_ELECTRON_SMOKE', 'SV_ELECTRON_SMOKE_DFC', 'SV_PACKAGED_TEST_AUTHORITY', 'SV_PACKAGED_TEST_AUTHORITY_NONCE'] as const
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
    Object.assign(process.env, { NODE_ENV: 'production', SV_ELECTRON_SMOKE: '1', SV_ELECTRON_SMOKE_DFC: '1',
      SV_PACKAGED_TEST_AUTHORITY: 'packaged_test_docx_fixture_authority_v1', SV_PACKAGED_TEST_AUTHORITY_NONCE: '0123456789abcdef0123456789abcdef' })
    try {
      const { invoke, exposeInMainWorld } = await load([...process.argv, '--user-data-dir=C:/tmp/starverse-packaged-smoke'])
      const bridge = exposeInMainWorld.mock.calls.find(([name]) => name === 'packagedTestDocxFixtureV1')?.[1]
      await bridge.issueGrant()
      expect(invoke).toHaveBeenCalledWith('packaged-smoke:issue-docx-fixture-grant-v1', {})
    } finally {
      for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    }
  })

  it('routes credentials and local runtime management through fixed V2 channels', async () => {
    const { invoke, exposeInMainWorld } = await load()
    const generationV2 = exposeInMainWorld.mock.calls.find(([name]) => name === 'generationV2')?.[1]

    await generationV2.credentials.openRouter.getStatus()
    await generationV2.localRuntime.generic.streamProbe({ url: 'http://127.0.0.1:1234' })
    await generationV2.localRuntime.lmStudio.loadModel({ model: 'model:1' })
    await generationV2.localRuntime.ollama.unloadModel({ model: 'model:1' })

    expect(invoke.mock.calls).toEqual([
      ['generation-v2:credentials:openrouter:get-status'],
      ['generation-v2:local-runtime:generic:stream-probe', { url: 'http://127.0.0.1:1234' }],
      ['generation-v2:local-runtime:lmstudio:load-model', { model: 'model:1' }],
      ['generation-v2:local-runtime:ollama:unload-model', { model: 'model:1' }],
    ])
  })

  it('decodes closed semantic events and removes the exact main listener on unsubscribe', async () => {
    const { exposeInMainWorld, on, removeListener } = await load()
    const bridge = exposeInMainWorld.mock.calls.find(([name]) => name === 'generationV2')?.[1]
    const listener = vi.fn()
    const unsubscribe = bridge.onModelFactsSemanticInvalidated(listener)
    const registered = on.mock.calls.find(([channel]) => channel === GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED)!
    const handler = registered[1]
    const event = { kind: 'capability_rules', sourceScopeId: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1,
      canonicalSourceRevision: `canonical-source-v1:${'a'.repeat(64)}` }
    handler({}, { ...event, sourceScopeId: 'renderer-scope' })
    handler({}, { ...event, sequence: 1 })
    expect(listener).not.toHaveBeenCalled()
    handler({}, event)
    expect(listener).toHaveBeenCalledExactlyOnceWith(event)
    expect(Object.isFrozen(listener.mock.calls[0]![0])).toBe(true)
    unsubscribe()
    expect(removeListener).toHaveBeenCalledExactlyOnceWith(GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED, handler)
  })

  it('forwards the exact search target packet through the fixed workspace channel', async () => {
    const { invoke, exposeInMainWorld } = await load()
    const generationV2 = exposeInMainWorld.mock.calls.find(([name]) => name === 'generationV2')?.[1]
    const packet = { messageId:'question:old',preferredBranchId:'branch:inherited',limit:1 }
    await generationV2.workspace.readSearchTarget(packet)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('generation-v2:workspace:read-search-target',packet)
  })
})
