import { describe, expect, it, vi } from 'vitest'
import {
  NETWORK_PROXY_SETTINGS_V2_STORE_KEY,
  compileProductNetworkProxyV2,
  createProductNetworkProxyV2Controller,
} from './productNetworkProxyV2'

const environmentSettings = Object.freeze({
  proxyMode: 'environment' as const,
  manualProxyUrl: '',
  noProxy: '',
  strictSSL: true,
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
