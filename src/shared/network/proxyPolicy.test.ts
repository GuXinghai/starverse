import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NETWORK_PROXY_POLICY,
  LOCAL_ENDPOINT_DIRECT_PROXY_POLICY,
  NETWORK_PROXY_POLICY_MODES,
  getDefaultNetworkProxyPolicyForTarget,
  normalizeNetworkProxyPolicy,
  normalizeNetworkProxyPolicyConfig,
  proxyTextContainsEmbeddedCredentials,
  resolveNetworkProxyPolicyForTarget,
  validateNetworkProxyPolicy,
} from './proxyPolicy'

describe('proxyPolicy', () => {
  it('normalizes missing and invalid policy input to the default system policy', () => {
    expect(normalizeNetworkProxyPolicy(undefined)).toEqual(DEFAULT_NETWORK_PROXY_POLICY)
    expect(normalizeNetworkProxyPolicy({ mode: 'bad', proxyRules: '  proxy.example:8080  ' })).toEqual({
      ...DEFAULT_NETWORK_PROXY_POLICY,
      proxyRules: 'proxy.example:8080',
    })
  })

  it('supports every Electron proxy policy mode', () => {
    for (const mode of NETWORK_PROXY_POLICY_MODES) {
      expect(normalizeNetworkProxyPolicy({ mode }).mode).toBe(mode)
    }
  })

  it('defaults localEndpoint traffic to direct while provider and download use system', () => {
    expect(getDefaultNetworkProxyPolicyForTarget('provider')).toEqual(DEFAULT_NETWORK_PROXY_POLICY)
    expect(getDefaultNetworkProxyPolicyForTarget('download')).toEqual(DEFAULT_NETWORK_PROXY_POLICY)
    expect(getDefaultNetworkProxyPolicyForTarget('localEndpoint')).toEqual(LOCAL_ENDPOINT_DIRECT_PROXY_POLICY)
  })

  it('reserves provider/download/localEndpoint override slots without resolving runtime traffic', () => {
    const config = normalizeNetworkProxyPolicyConfig({
      defaultPolicy: { mode: 'system' },
      overrides: {
        provider: { mode: 'fixed_servers', proxyRules: 'https=proxy.internal:8443' },
        localEndpoint: { mode: 'direct' },
      },
    })

    expect(resolveNetworkProxyPolicyForTarget(config, 'provider')).toMatchObject({
      mode: 'fixed_servers',
      proxyRules: 'https=proxy.internal:8443',
    })
    expect(resolveNetworkProxyPolicyForTarget(config, 'download')).toEqual(config.defaultPolicy)
    expect(resolveNetworkProxyPolicyForTarget(config, 'localEndpoint')).toEqual(LOCAL_ENDPOINT_DIRECT_PROXY_POLICY)
  })

  it('returns validation errors for mode-specific missing fields', () => {
    expect(validateNetworkProxyPolicy({ mode: 'fixed_servers' })).toMatchObject({
      ok: false,
      issues: [{ code: 'proxy_policy_fixed_servers_requires_proxy_rules', field: 'proxyRules' }],
    })
    expect(validateNetworkProxyPolicy({ mode: 'pac_script' })).toMatchObject({
      ok: false,
      issues: [{ code: 'proxy_policy_pac_script_requires_pac_script', field: 'pacScript' }],
    })
  })

  it('rejects embedded proxy URL credentials and leaves credentialRef as the allowed future hook', () => {
    const result = validateNetworkProxyPolicy({
      mode: 'fixed_servers',
      proxyRules: 'http=https://user:secret@proxy.internal:8443',
      credentialRef: 'secure-store:proxy/main',
    })

    expect(result).toMatchObject({
      ok: false,
      policy: { credentialRef: 'secure-store:proxy/main' },
      issues: [{ code: 'proxy_policy_proxy_rules_contains_credentials', field: 'proxyRules' }],
    })
    expect(proxyTextContainsEmbeddedCredentials('user:secret@proxy.internal:8080')).toBe(true)
    expect(proxyTextContainsEmbeddedCredentials('http=proxy.internal:8080;https=proxy.internal:8443')).toBe(false)
  })

  it('rejects credential-bearing PAC script URLs', () => {
    expect(validateNetworkProxyPolicy({
      mode: 'pac_script',
      pacScript: 'https://user:secret@example.test/proxy.pac',
    })).toMatchObject({
      ok: false,
      issues: [{ code: 'proxy_policy_pac_script_contains_credentials', field: 'pacScript' }],
    })
  })
})
