import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Generation V2 preload boundary', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unmock('electron')
  })

  async function load(argv = process.argv) {
    const invoke = vi.fn()
    const exposeInMainWorld = vi.fn()
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
    }))
    const previousArgv = process.argv
    Object.defineProperty(process, 'argv', { configurable: true, value: argv })
    try { await import('./preload') } finally { Object.defineProperty(process, 'argv', { configurable: true, value: previousArgv }) }
    return { invoke, exposeInMainWorld }
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
})
