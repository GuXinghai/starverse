import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NETWORK_PROXY_POLICY,
  NETWORK_PROXY_POLICY_STORE_KEY,
  type NetworkProxyPolicy,
} from '../../src/shared/network/proxyPolicy'
import { createElectronSessionProxyController } from './electronSessionProxyController'

function createStore(initialPolicy?: unknown) {
  const values = new Map<string, unknown>()
  if (initialPolicy !== undefined) values.set(NETWORK_PROXY_POLICY_STORE_KEY, initialPolicy)
  return {
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value)
    }),
    values,
  }
}

function createSession() {
  return {
    setProxy: vi.fn(async () => undefined),
    forceReloadProxyConfig: vi.fn(async () => undefined),
    closeAllConnections: vi.fn(async () => undefined),
    resolveProxy: vi.fn(async () => 'DIRECT'),
  }
}

describe('electronSessionProxyController', () => {
  it('reads a normalized policy from electron-store', () => {
    const store = createStore({ mode: 'fixed_servers', proxyRules: '  https=proxy.internal:8443  ' })
    const controller = createElectronSessionProxyController({ store: store as any, session: createSession() })

    expect(controller.getPolicy()).toEqual({
      ok: true,
      policy: {
        ...DEFAULT_NETWORK_PROXY_POLICY,
        mode: 'fixed_servers',
        proxyRules: 'https=proxy.internal:8443',
      },
    })
  })

  it.each([
    [{ mode: 'system' }, { mode: 'system' }],
    [{ mode: 'direct' }, { mode: 'direct' }],
    [{ mode: 'auto_detect' }, { mode: 'auto_detect' }],
    [{ mode: 'fixed_servers', proxyRules: 'http=proxy.internal:8080' }, {
      mode: 'fixed_servers',
      proxyRules: 'http=proxy.internal:8080',
    }],
    [{ mode: 'pac_script', pacScript: 'https://proxy.example.test/proxy.pac' }, {
      mode: 'pac_script',
      pacScript: 'https://proxy.example.test/proxy.pac',
    }],
  ] as const)('applies %s by calling Electron setProxy', async (policy, expectedConfig) => {
    const session = createSession()
    const store = createStore(policy)
    const controller = createElectronSessionProxyController({ store: store as any, session, nowMs: () => 1000 })

    const result = await controller.applyCurrentPolicy({ reason: 'startup' })

    expect(result).toMatchObject({
      ok: true,
      config: expectedConfig,
      reason: 'startup',
      closedConnections: false,
      appliedAtMs: 1000,
    })
    expect(session.setProxy).toHaveBeenCalledWith(expectedConfig)
    expect(session.forceReloadProxyConfig).toHaveBeenCalledTimes(1)
    expect(session.closeAllConnections).not.toHaveBeenCalled()
  })

  it('saves and manually applies policy updates with connection close', async () => {
    const session = createSession()
    const store = createStore()
    const controller = createElectronSessionProxyController({ store: store as any, session, nowMs: () => 2000 })
    const policy: NetworkProxyPolicy = {
      ...DEFAULT_NETWORK_PROXY_POLICY,
      mode: 'fixed_servers',
      proxyRules: 'https=proxy.internal:8443',
      proxyBypassRules: '<local>',
    }

    const result = await controller.updatePolicy(policy)

    expect(result).toMatchObject({
      ok: true,
      config: {
        mode: 'fixed_servers',
        proxyRules: 'https=proxy.internal:8443',
        proxyBypassRules: '<local>',
      },
      reason: 'manual',
      closedConnections: true,
      appliedAtMs: 2000,
    })
    expect(store.set).toHaveBeenCalledWith(NETWORK_PROXY_POLICY_STORE_KEY, policy)
    expect(session.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'https=proxy.internal:8443',
      proxyBypassRules: '<local>',
    })
    expect(session.forceReloadProxyConfig).toHaveBeenCalledTimes(1)
    expect(session.closeAllConnections).toHaveBeenCalledTimes(1)
  })

  it('does not save or apply invalid credential-bearing proxy rules', async () => {
    const session = createSession()
    const store = createStore()
    const controller = createElectronSessionProxyController({ store: store as any, session })

    const result = await controller.updatePolicy({
      mode: 'fixed_servers',
      proxyRules: 'https://user:secret@proxy.internal:8443',
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_policy',
      issues: [{ code: 'proxy_policy_proxy_rules_contains_credentials', field: 'proxyRules' }],
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(store.set).not.toHaveBeenCalled()
    expect(session.setProxy).not.toHaveBeenCalled()
  })

  it('resets to the default system policy and closes existing connections', async () => {
    const session = createSession()
    const store = createStore({ mode: 'direct' })
    const controller = createElectronSessionProxyController({ store: store as any, session })

    const result = await controller.resetPolicy()

    expect(result).toMatchObject({
      ok: true,
      policy: DEFAULT_NETWORK_PROXY_POLICY,
      config: { mode: 'system' },
      reason: 'manual',
      closedConnections: true,
    })
    expect(store.set).toHaveBeenCalledWith(NETWORK_PROXY_POLICY_STORE_KEY, DEFAULT_NETWORK_PROXY_POLICY)
    expect(session.closeAllConnections).toHaveBeenCalledTimes(1)
  })

  it('returns sanitized structured resolveProxy diagnostics', async () => {
    const session = createSession()
    session.resolveProxy.mockResolvedValueOnce('PROXY user:secret@proxy.internal:8080; DIRECT')
    const controller = createElectronSessionProxyController({ store: createStore() as any, session, nowMs: () => 3000 })

    const result = await controller.resolveProxy('https://user:secret@example.test/path?q=1#hash')

    expect(result).toEqual({
      ok: true,
      url: 'https://example.test/path',
      resolvedProxy: 'PROXY [redacted]@proxy.internal:8080; DIRECT',
      proxyKind: 'PROXY configured',
      observedAtMs: 3000,
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('?q=1')
    expect(session.resolveProxy).toHaveBeenCalledWith('https://user:secret@example.test/path?q=1#hash')
  })

  it('rejects unsupported diagnostic URLs before resolveProxy', async () => {
    const session = createSession()
    const controller = createElectronSessionProxyController({ store: createStore() as any, session })

    const result = await controller.resolveProxy('file:///C:/Users/owner/secret.txt')

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_url',
      message: 'External URL protocol is blocked.',
      safeUrl: 'file:[blocked]',
    })
    expect(session.resolveProxy).not.toHaveBeenCalled()
  })
})
