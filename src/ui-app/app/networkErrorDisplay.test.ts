import { beforeEach, describe, expect, it } from 'vitest'
import { resetI18nForTests, setLocale, t } from '@/shared/i18n'
import {
  replaceNetworkCodeInMessage,
  resolveNetworkCodeDisplayMessage,
  resolveNetworkErrorDisplayMessage,
  resolveNetworkFailureDisplayMessage,
} from './networkErrorDisplay'

describe('networkErrorDisplay', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it.each([
    ['http_401_auth', 'errors.network.reason.http401Auth'],
    ['http_403_forbidden', 'errors.network.reason.http403Forbidden'],
    ['http_404_not_found_or_model_missing', 'errors.network.reason.http404NotFoundOrModelMissing'],
    ['http_429_rate_limited', 'errors.network.reason.http429RateLimited'],
    ['proxy_auth_required', 'errors.network.reason.proxyAuthRequired'],
    ['proxy_connect_failed', 'errors.network.reason.proxyConnectFailed'],
    ['dns_error', 'errors.network.reason.dnsError'],
    ['connection_timeout', 'errors.network.reason.connectionTimeout'],
    ['tls_or_certificate_error', 'errors.network.reason.tlsOrCertificateError'],
    ['request_aborted', 'errors.network.reason.requestAborted'],
    ['local_endpoint_rejected_remote_host', 'errors.network.reason.localEndpointRejectedRemoteHost'],
    ['download_hash_mismatch', 'errors.network.reason.downloadHashMismatch'],
  ])('maps structured reason %s through i18n', (reason, key) => {
    expect(resolveNetworkErrorDisplayMessage({
      requestPurpose: 'provider_stream',
      transportKind: 'electron_session_fetch',
      reason,
      safeDetailCode: reason,
      safeMessage: 'unsafe Authorization: Bearer sk-secret prompt text',
      safeMessageKey: key,
      retryable: false,
    })).toBe(t(key))
  })

  it('ignores unsafe safeMessage text and uses translated safe detail code', () => {
    const message = resolveNetworkErrorDisplayMessage({
      requestPurpose: 'provider_stream',
      transportKind: 'electron_session_fetch',
      reason: 'network_unknown',
      safeDetailCode: 'http_429_rate_limited',
      safeMessage: 'Authorization: Bearer sk-secret prompt=secret proxy=http://user:pass@example.test',
      safeMessageKey: 'errors.network.reason.http429RateLimited',
      retryable: true,
      stack: 'should not be read',
      cause: new Error('should not be read'),
    })

    expect(message).toBe(t('errors.network.reason.http429RateLimited'))
    expect(message).not.toContain('sk-secret')
    expect(message).not.toContain('prompt')
    expect(message).not.toContain('user:pass')
  })

  it('falls back to old message when no structured networkError or specific display code exists', () => {
    expect(resolveNetworkFailureDisplayMessage({
      code: 'network_error',
      message: 'Legacy provider message',
    })).toBe('Legacy provider message')
  })

  it.each([
    ['remote_host_rejected', 'errors.network.reason.localEndpointRejectedRemoteHost'],
    ['embedded_credentials_rejected', 'errors.network.reason.localEndpointEmbeddedCredentialsRejected'],
    ['redirect_rejected', 'errors.network.reason.downloadRedirectRejected'],
    ['hash_mismatch', 'errors.network.reason.downloadHashMismatch'],
    ['size_mismatch', 'errors.network.reason.downloadSizeMismatch'],
    ['resume_retries_exhausted', 'errors.network.reason.downloadResumeRangeRejected'],
    ['download_failed', 'errors.network.reason.downloadFailed'],
    ['timeout', 'errors.network.reason.connectionTimeout'],
    ['cancelled', 'errors.network.reason.requestAborted'],
  ])('maps legacy code %s to a specific user message', (code, key) => {
    expect(resolveNetworkCodeDisplayMessage(code)).toBe(t(key))
  })

  it('replaces known code tokens inside status summaries', () => {
    expect(replaceNetworkCodeInMessage('Install failed: download_failed', 'download_failed'))
      .toBe(`Install failed: ${t('errors.network.reason.downloadFailed')}`)
  })

  it('uses the current locale when rendering display text', () => {
    setLocale('en-US')
    expect(resolveNetworkCodeDisplayMessage('proxy_auth_required')).toBe('Proxy authentication is required.')
    setLocale('zh-CN')
    expect(resolveNetworkCodeDisplayMessage('proxy_auth_required')).toBe('代理需要认证。')
  })
})
