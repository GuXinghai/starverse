import { describe, expect, it } from 'vitest'
import { compileElectronProxyConfig } from './electronProxyConfigCompiler'

describe('electronProxyConfigCompiler', () => {
  it('compiles system, direct, and auto-detect policies without mode-specific fields', () => {
    expect(compileElectronProxyConfig({ mode: 'system' })).toMatchObject({
      ok: true,
      config: { mode: 'system' },
    })
    expect(compileElectronProxyConfig({ mode: 'direct' })).toMatchObject({
      ok: true,
      config: { mode: 'direct' },
    })
    expect(compileElectronProxyConfig({ mode: 'auto_detect' })).toMatchObject({
      ok: true,
      config: { mode: 'auto_detect' },
    })
  })

  it('compiles fixed server rules and bypass rules', () => {
    expect(compileElectronProxyConfig({
      mode: 'fixed_servers',
      proxyRules: 'http=proxy.internal:8080;https=proxy.internal:8443',
      proxyBypassRules: '<local>;*.example.test',
    })).toMatchObject({
      ok: true,
      config: {
        mode: 'fixed_servers',
        proxyRules: 'http=proxy.internal:8080;https=proxy.internal:8443',
        proxyBypassRules: '<local>;*.example.test',
      },
    })
  })

  it('compiles PAC script policy', () => {
    expect(compileElectronProxyConfig({
      mode: 'pac_script',
      pacScript: 'https://proxy.example.test/proxy.pac',
    })).toMatchObject({
      ok: true,
      config: {
        mode: 'pac_script',
        pacScript: 'https://proxy.example.test/proxy.pac',
      },
    })
  })

  it('returns explicit validation errors instead of compiling unsafe proxy URLs', () => {
    expect(compileElectronProxyConfig({
      mode: 'fixed_servers',
      proxyRules: 'https://user:secret@proxy.internal:8443',
    })).toMatchObject({
      ok: false,
      issues: [{ code: 'proxy_policy_proxy_rules_contains_credentials', field: 'proxyRules' }],
    })
  })

  it('normalizes invalid input to a safe system Electron config', () => {
    expect(compileElectronProxyConfig({ mode: 'not-valid', proxyRules: 'ignored.example:8080' })).toMatchObject({
      ok: true,
      config: { mode: 'system' },
    })
  })
})
