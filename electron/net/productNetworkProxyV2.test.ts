import { describe, expect, it, vi } from 'vitest'
import {
  NETWORK_PROXY_SETTINGS_V2_STORE_KEY,
  BROWSER_PROXY_SETTINGS_STORE_KEY,
  compileProductNetworkProxyV2,
  createProductNetworkProxyV2Controller,
} from './productNetworkProxyV2'

const environmentSettings = Object.freeze({
  proxyMode: 'environment' as const,
  manualProxyUrl: '',
  noProxy: '',
  strictSSL: true,
})

function fixture(application = { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true }, browser?: unknown) {
  const values = new Map<string, unknown>([[NETWORK_PROXY_SETTINGS_V2_STORE_KEY, application]])
  if (browser !== undefined) values.set(BROWSER_PROXY_SETTINGS_STORE_KEY, browser)
  const makeSession = () => ({ setProxy: vi.fn(async (_config: unknown): Promise<void> => undefined), forceReloadProxyConfig: vi.fn(async () => undefined),
    closeAllConnections: vi.fn(async () => undefined), resolveProxy: vi.fn(async () => 'DIRECT') })
  const session = makeSession()
  const browserSession = makeSession()
  const store = { get: (key: string) => values.get(key), set: vi.fn((key: string | Record<string, unknown>, value?: unknown) => {
    if (typeof key === 'string') values.set(key, value)
    else for (const [name, item] of Object.entries(key)) values.set(name, item)
  }) }
  const env: Record<string, string> = {}
  const controller = createProductNetworkProxyV2Controller({ store: store as any, session, browserSession, env: () => env })
  return { controller, session, browserSession, store, values, env }
}
const manual = (port: number) => ({ proxyMode: 'manual' as const, manualProxyUrl: `http://127.0.0.1:${port}`, noProxy: '', strictSSL: true })

describe('application and browser proxy coordination', () => {
  it('compiles SOCKS5, ALL_PROXY and lowercase-first compatibility priorities', () => {
    const settings = { proxyMode: 'environment', manualProxyUrl: '', noProxy: 'ignored.test', strictSSL: true }
    expect(compileProductNetworkProxyV2(settings, { ALL_PROXY: 'socks5://127.0.0.1:1080' })).toMatchObject({ ok: true, value: {
      electronConfig: { proxyRules: 'http=socks5://127.0.0.1:1080;https=socks5://127.0.0.1:1080' },
    } })
    expect(compileProductNetworkProxyV2(settings, { http_proxy: ' ', HTTP_PROXY: 'http://http.test:80', ALL_PROXY: 'http://all.test:80' }))
      .toMatchObject({ ok: true, value: { electronConfig: { proxyRules: 'http=http://http.test;https=http://http.test' } } })
    expect(compileProductNetworkProxyV2({ ...manual(1080), manualProxyUrl: 'socks5://user:secret@localhost:1080' }))
      .toMatchObject({ ok: false, code: 'proxy_auth_required' })
    expect(compileProductNetworkProxyV2({ ...manual(1080), manualProxyUrl: 'socks4://localhost:1080' }))
      .toMatchObject({ ok: false, code: 'proxy_manual_invalid' })
  })
  it('defaults old profiles to follow, skips unchanged saves and retains independent drafts', async () => {
    const f = fixture()
    await f.controller.applyStoredSettings()
    expect(f.browserSession.setProxy).toHaveBeenCalledWith({ mode: 'system' })
    await f.controller.updateConfiguration(f.controller.getConfiguration().configuration)
    expect(f.session.setProxy).toHaveBeenCalledTimes(1)
    expect(f.store.set).not.toHaveBeenCalled()
    const next = { application: manual(8001), browser: { mode: 'independent', settings: manual(8002) } }
    expect(await f.controller.updateConfiguration(next)).toMatchObject({ ok: true })
    f.browserSession.setProxy.mockClear()
    await f.controller.updateSettings(manual(8003))
    expect(f.browserSession.setProxy).not.toHaveBeenCalled()
    await f.controller.updateConfiguration({ application: manual(8003), browser: { ...next.browser, mode: 'inherit' } })
    expect(f.browserSession.setProxy).toHaveBeenCalledWith({ mode: 'fixed_servers', proxyRules: 'http=http://127.0.0.1:8003;https=http://127.0.0.1:8003' })
    expect(f.values.get(BROWSER_PROXY_SETTINGS_STORE_KEY)).toEqual({ mode: 'inherit', settings: manual(8002) })
  })
  it('isolates invalid stored browser settings from application startup and conversely', async () => {
    const f = fixture(undefined, { mode: 'corrupt' })
    await f.controller.applyStoredSettings()
    expect(f.controller.getState().status).toBe('ready')
    expect(f.controller.getState('browser').status).toBe('blocked')
    const g = fixture({ ...manual(1), proxyMode: 'environment' }, { mode: 'independent', settings: manual(2) })
    await g.controller.applyStoredSettings()
    expect(g.controller.getState().status).toBe('blocked')
    expect(g.controller.getState('browser').status).toBe('ready')
  })
  it('explicit repair of a malformed application policy also restores its following browser', async () => {
    const f = fixture()
    f.values.set(NETWORK_PROXY_SETTINGS_V2_STORE_KEY, { corrupt: true })
    await f.controller.applyStoredSettings()
    expect(f.controller.getState().status).toBe('blocked')
    expect(f.controller.getState('browser').status).toBe('blocked')
    expect(await f.controller.resetSettings()).toMatchObject({ ok: true })
    expect(f.controller.getState().status).toBe('ready')
    expect(f.controller.getState('browser').status).toBe('ready')
  })
  it.each(['application', 'browser'] as const)('never repairs a corrupt %s policy through the other scope', async (corruptScope) => {
    const f = fixture(manual(8001), { mode: 'independent', settings: manual(8002) })
    const key = corruptScope === 'application' ? NETWORK_PROXY_SETTINGS_V2_STORE_KEY : BROWSER_PROXY_SETTINGS_STORE_KEY
    f.values.set(key, { corrupt: true })
    await f.controller.applyStoredSettings()
    const healthyScope = corruptScope === 'application' ? 'browser' : 'application'
    const corruptSession = corruptScope === 'application' ? f.session : f.browserSession
    corruptSession.setProxy.mockClear()
    f.store.set.mockClear()
    await f.controller.applyStoredSettings(healthyScope)
    expect(f.controller.getState(corruptScope).status).toBe('blocked')
    expect(corruptSession.setProxy).not.toHaveBeenCalled()
    expect(f.store.set).not.toHaveBeenCalled()
    expect(f.values.get(key)).toEqual({ corrupt: true })
    const configuration = f.controller.getConfiguration().configuration
    await f.controller.updateConfiguration(healthyScope === 'application' ? { ...configuration, application: manual(8003) }
      : { ...configuration, browser: { mode: 'independent', settings: manual(8003) } })
    expect(f.controller.getState(corruptScope).status).toBe('blocked')
    expect(corruptSession.setProxy).not.toHaveBeenCalled()
    expect(f.values.get(key)).toEqual({ corrupt: true })
  })
  it('rolls both scopes back after partial session application and blocks only failed rollbacks', async () => {
    const f = fixture()
    await f.controller.applyStoredSettings()
    f.browserSession.setProxy.mockRejectedValueOnce(new Error('failed'))
    const result = await f.controller.updateSettings(manual(9001))
    expect(result).toMatchObject({ ok: false, code: 'proxy_session_apply_failed' })
    expect(f.session.setProxy).toHaveBeenLastCalledWith({ mode: 'system' })
    expect(f.browserSession.setProxy).toHaveBeenLastCalledWith({ mode: 'system' })
    expect(f.controller.getState('browser').status).toBe('ready')
    f.store.set.mockImplementation(() => { throw new Error('disk failed') })
    f.browserSession.setProxy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rollback failed'))
    expect(await f.controller.updateSettings(manual(9002))).toMatchObject({ ok: false, code: 'proxy_store_rollback_failed' })
    expect(f.controller.getState().status).toBe('ready')
    expect(() => f.controller.assertGovernedRequestAvailable('browser')).toThrow('proxy_store_rollback_failed')
  })
  it('serializes writes and blocks new requests while applying', async () => {
    const f = fixture()
    await f.controller.applyStoredSettings()
    let release!: () => void
    f.session.setProxy.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const first = f.controller.updateSettings(manual(8001))
    const second = f.controller.updateSettings(manual(8002))
    await vi.waitFor(() => expect(f.controller.getState().status).toBe('applying'))
    expect(() => f.controller.assertGovernedRequestAvailable()).toThrow('proxy_updating')
    release()
    await Promise.all([first, second])
    expect(f.controller.getState().settings).toEqual(manual(8002))
    expect(f.controller.getState('browser').settings).toEqual(manual(8002))
  })
  it.each(['application', 'browser'] as const)('requires a real apply before unlocking a rollback-failed %s scope', async (scope) => {
    const prior = manual(8001)
    const f = fixture(prior, { mode: 'independent', settings: prior })
    await f.controller.applyStoredSettings()
    const target = scope === 'application' ? f.session : f.browserSession
    const update = (settings: ReturnType<typeof manual>) => {
      const config = f.controller.getConfiguration().configuration
      return f.controller.updateConfiguration(scope === 'application' ? { ...config, application: settings }
        : { ...config, browser: { mode: 'independent', settings } })
    }
    target.setProxy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rollback failed'))
    target.forceReloadProxyConfig.mockRejectedValueOnce(new Error('reload failed after new policy was installed'))
    expect(await update(manual(8002))).toMatchObject({ ok: false, code: 'proxy_store_rollback_failed' })
    expect(f.controller.getState(scope).status).toBe('blocked')
    const equivalent = { ...prior, manualProxyUrl: `${prior.manualProxyUrl}/` }
    const before = target.setProxy.mock.calls.length
    target.setProxy.mockRejectedValueOnce(new Error('still unable to apply'))
    expect(await update(equivalent)).toMatchObject({ ok: false })
    expect(target.setProxy.mock.calls.length).toBeGreaterThan(before)
    expect(() => f.controller.assertGovernedRequestAvailable(scope)).toThrow()
    expect(await update(equivalent)).toMatchObject({ ok: true })
    expect(target.setProxy).toHaveBeenLastCalledWith({ mode: 'fixed_servers', proxyRules: 'http=http://127.0.0.1:8001;https=http://127.0.0.1:8001' })
    expect(f.controller.getState(scope).status).toBe('ready')
  })
  it('reapplies current environment and never returns environment credentials or query strings', async () => {
    const f = fixture({ proxyMode: 'environment', manualProxyUrl: '', noProxy: '', strictSSL: true })
    f.env.HTTP_PROXY = 'http://127.0.0.1:8001'
    await f.controller.applyStoredSettings()
    f.env.HTTP_PROXY = 'http://127.0.0.1:8002'
    await f.controller.applyStoredSettings()
    expect(f.session.setProxy).toHaveBeenLastCalledWith({ mode: 'fixed_servers', proxyRules: 'http=http://127.0.0.1:8002;https=http://127.0.0.1:8002' })
    f.env.HTTPS_PROXY = 'http://user:secret@proxy.test/?token=secret'
    expect(JSON.stringify(f.controller.getEnvironment())).not.toContain('secret')
  })
})

describe('product network proxy V2 authority', () => {
  it('freezes lowercase-first environment semantics into one fixed_servers config', () => {
    expect(compileProductNetworkProxyV2(environmentSettings, {
      http_proxy: 'http://lower-http.test:8080',
      HTTP_PROXY: 'http://upper-http.test:8080',
      HTTPS_PROXY: 'https://upper-https.test:8443',
      no_proxy: 'localhost,.example.test,10.0.0.0/8',
    })).toEqual({
      ok: true,
      value: {
        settings: environmentSettings,
        electronConfig: {
          mode: 'fixed_servers',
          proxyRules: 'http=http://lower-http.test:8080;https=https://upper-https.test:8443',
          proxyBypassRules: 'localhost;.example.test;10.0.0.0/8',
        },
      },
    })

    expect(compileProductNetworkProxyV2(environmentSettings, {
      https_proxy: 'http://https-only.test:8080',
    })).toMatchObject({ ok: true, value: { electronConfig: {
      mode: 'fixed_servers', proxyRules: 'https=http://https-only.test:8080',
    } } })
    expect(compileProductNetworkProxyV2(environmentSettings, { NO_PROXY: 'localhost' }))
      .toMatchObject({ ok: false, code: 'proxy_environment_unavailable' })
    expect(compileProductNetworkProxyV2(environmentSettings, { http_proxy: 'http://user:secret@proxy.test' }))
      .toMatchObject({ ok: false, code: 'proxy_auth_required' })
  })

  it('applies, reloads and closes connections before persisting the new product mode', async () => {
    const values = new Map<string, unknown>([[NETWORK_PROXY_SETTINGS_V2_STORE_KEY, environmentSettings]])
    const events: string[] = []
    const controller = createProductNetworkProxyV2Controller({
      store: {
        get: (key: string) => values.get(key),
        set: (key: string, value: unknown) => { events.push('persist'); values.set(key, value) },
      } as any,
      session: {
        setProxy: async () => { events.push('setProxy') },
        forceReloadProxyConfig: async () => { events.push('reload') },
        closeAllConnections: async () => { events.push('close') },
        resolveProxy: async () => 'DIRECT',
      },
      env: { http_proxy: 'http://proxy.test:8080' },
      nowMs: () => 10,
    })

    const result = await controller.updateSettings({
      proxyMode: 'direct', manualProxyUrl: '', noProxy: '', strictSSL: true,
    })
    expect(result).toMatchObject({ ok: true, state: { status: 'ready', appliedAtMs: 10 } })
    expect(events).toEqual(['setProxy', 'reload', 'close', 'persist'])
  })

  it('restores the prior compiled session policy when persistence fails', async () => {
    const values = new Map<string, unknown>([[NETWORK_PROXY_SETTINGS_V2_STORE_KEY, environmentSettings]])
    let setCalls = 0
    const setProxy = vi.fn(async () => { setCalls += 1 })
    const controller = createProductNetworkProxyV2Controller({
      store: {
        get: (key: string) => values.get(key),
        set: () => { throw new Error('disk unavailable') },
      } as any,
      session: {
        setProxy,
        forceReloadProxyConfig: async () => undefined,
        closeAllConnections: async () => undefined,
        resolveProxy: async () => 'DIRECT',
      },
      env: { http_proxy: 'http://proxy.test:8080' },
      nowMs: () => 20,
    })
    expect(await controller.applyStoredSettings()).toMatchObject({ ok: true })
    const result = await controller.updateSettings({
      proxyMode: 'direct', manualProxyUrl: '', noProxy: '', strictSSL: true,
    })
    expect(result).toMatchObject({ ok: false, code: 'proxy_store_unavailable' })
    expect(controller.getState()).toMatchObject({ status: 'ready', settings: environmentSettings })
    expect(setCalls).toBe(3)
  })
})
