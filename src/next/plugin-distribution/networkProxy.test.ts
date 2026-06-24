import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NETWORK_PROXY_SETTINGS,
  buildProxyFetchInit,
  normalizeNetworkProxySettings,
  redactProxyCredentialText,
  resolveNetworkProxyForUrl,
} from './networkProxy'

describe('networkProxy', () => {
  it('normalizes to environment mode by default', () => {
    expect(normalizeNetworkProxySettings(null)).toEqual(DEFAULT_NETWORK_PROXY_SETTINGS)
  })

  it('rejects system mode for the Node downloader without silent fallback', () => {
    const resolved = resolveNetworkProxyForUrl({
      proxyMode: 'system',
      manualProxyUrl: '',
      noProxy: '',
      strictSSL: true,
    }, 'https://github.com/owner/repo/releases/download/tag/pkg.svpkg')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.diagnosticCode).toBe('proxy_system_unavailable')
  })

  it('rejects credential-bearing manual proxy URLs', () => {
    const resolved = resolveNetworkProxyForUrl({
      proxyMode: 'manual',
      manualProxyUrl: 'http://user:secret@127.0.0.1:7890',
      noProxy: '',
      strictSSL: true,
    }, 'https://github.com/owner/repo/releases/download/tag/pkg.svpkg')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.diagnosticCode).toBe('proxy_auth_required')
    expect(redactProxyCredentialText('http://user:secret@127.0.0.1:7890')).not.toContain('secret')
  })

  it('honors noProxy by returning direct fetch init without dispatcher', () => {
    const resolved = resolveNetworkProxyForUrl({
      proxyMode: 'manual',
      manualProxyUrl: 'http://127.0.0.1:7890',
      noProxy: '.github.com',
      strictSSL: true,
    }, 'https://github.com/owner/repo/releases/download/tag/pkg.svpkg')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.bypassed).toBe(true)
      expect(resolved.dispatcher).toBeUndefined()
    }
  })

  it('builds a sanitized failure init for unsupported strict SSL disablement', () => {
    const init = buildProxyFetchInit({
      proxyMode: 'direct',
      manualProxyUrl: '',
      noProxy: '',
      strictSSL: false,
    }, 'https://github.com/owner/repo/releases/download/tag/pkg.svpkg')
    expect('ok' in init && init.ok === false).toBe(true)
    if ('ok' in init && init.ok === false) {
      expect(init.diagnosticCode).toBe('proxy_strict_ssl_unsupported')
    }
  })
})
