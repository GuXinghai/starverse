import { describe, expect, it, vi } from 'vitest'
import type { CompatibleEndpointRevision } from '../../src/shared/provider/openai-chat-compatible/domain'
import { createCompatibleRequestRegistry } from '../net/compatibleRequestRegistry'
import { createCompatibleProviderTransportService } from './compatibleProviderTransportService'

function endpoint(): CompatibleEndpointRevision {
  return {
    endpointRevisionId: 'ocp_endpoint_12345678',
    providerInstanceId: 'ocp_provider_12345678',
    revision: 2,
    baseUrl: 'https://api.example/v1',
    allowInsecureHttp: false,
    securityPolicy: 'compatibility_first',
    auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
    credentialVersionRef: 'ocp_credential_12345678',
    ordinaryHeaders: [],
    sensitiveHeaderRefs: [],
    query: [],
    requestProfileId: 'ocp_request_profile_12345678',
    requestProfileVersion: 1,
    responseProfileId: 'ocp_response_profile_12345678',
    responseProfileVersion: 1,
    createdAtMs: 2,
  } as unknown as CompatibleEndpointRevision
}

function dependencies(input?: Readonly<{ status?: number; providerStatus?: 'active' | 'disabled' | 'deleted' }>) {
  const proxySettings = { proxyMode: 'manual', manualProxyUrl: 'http://proxy.example:8080', noProxy: '', strictSSL: true }
  const db = { call: vi.fn(async (method: string) => {
    if (method === 'compatibleProvider.get') return {
      providerInstanceId: 'ocp_provider_12345678',
      protocolKey: 'openai_chat_compatible',
      displayName: 'Provider',
      status: input?.providerStatus ?? 'active',
      createdAtMs: 1,
      updatedAtMs: 1,
      deletedAtMs: null,
    }
    if (method === 'compatibleEndpoint.listRevisions') return [endpoint()]
    if (method === 'settings.getNetworkProxySettingsStrict') return { value: proxySettings }
    throw new Error('unexpected method')
  }) }
  const credentials = { readForMain: vi.fn(() => ({ mode: 'bearer' as const, token: 'secret-value' })) }
  const transport: { request: ReturnType<typeof vi.fn> } = { request: vi.fn(async (request: any) => {
    request.resolveCredential?.()
    return {
      ok: true as const,
      response: new Response('{}', { status: input?.status ?? 200 }),
      diagnostics: {
        securityPolicy: 'compatibility_first' as const,
        proxyRoute: 'manual' as const,
        transportKind: 'node_undici' as const,
        transportCapability: 'pre_request_audit_only' as const,
        proxyBypassed: false,
        redirectCount: 0,
        insecureHttp: false,
      },
    }
  }) }
  const requests = createCompatibleRequestRegistry()
  return { db, credentials, transport, requests, proxySettings }
}

describe('compatibleProviderTransportService', () => {
  it('resolves provider/immutable endpoint/proxy settings in main and returns only safe diagnostics', async () => {
    const deps = dependencies()
    const service = createCompatibleProviderTransportService(deps as any)
    const result = await service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(result).toEqual({
      ok: true,
      requestId: 'connection-1',
      httpStatus: 200,
      diagnostics: expect.objectContaining({
        securityPolicy: 'compatibility_first',
        proxyRoute: 'manual',
        transportKind: 'node_undici',
      }),
    })
    expect(deps.transport.request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: expect.objectContaining({ endpointRevisionId: 'ocp_endpoint_12345678' }),
      operation: 'models',
      proxySettings: deps.proxySettings,
      signal: expect.any(AbortSignal),
      resolveCredential: expect.any(Function),
    }))
    expect(deps.credentials.readForMain).toHaveBeenCalledWith('ocp_credential_12345678')
    expect(JSON.stringify(result)).not.toContain('secret-value')
    expect(JSON.stringify(result)).not.toContain('api.example')
    expect(deps.requests.activeCount()).toBe(0)
  })

  it('blocks a disabled provider before endpoint, credential or transport access', async () => {
    const deps = dependencies({ providerStatus: 'disabled' })
    const service = createCompatibleProviderTransportService(deps as any)
    const result = await service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(result).toEqual({
      ok: false,
      requestId: 'connection-1',
      error: expect.objectContaining({ code: 'compatible_config_invalid' }),
    })
    expect(deps.transport.request).not.toHaveBeenCalled()
    expect(deps.credentials.readForMain).not.toHaveBeenCalled()
  })

  it('maps HTTP failures without retaining the provider body', async () => {
    const deps = dependencies({ status: 401 })
    const service = createCompatibleProviderTransportService(deps as any)
    const result = await service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(result).toEqual({
      ok: false,
      requestId: 'connection-1',
      error: expect.objectContaining({ code: 'compatible_http_auth', httpStatus: 401 }),
    })
  })

  it('passes through a strict capability block without reading credentials', async () => {
    const deps = dependencies()
    deps.transport.request.mockImplementationOnce(async () => ({
      ok: false,
      error: {
        code: 'compatible_strict_ssrf_unavailable',
        stage: 'connect',
        safeMessage: 'Strict SSRF protection is unavailable for the selected transport.',
        retryable: false,
      },
    }))
    const service = createCompatibleProviderTransportService(deps as any)
    const result = await service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(result).toEqual({
      ok: false,
      requestId: 'connection-1',
      error: expect.objectContaining({ code: 'compatible_strict_ssrf_unavailable' }),
    })
    expect(deps.credentials.readForMain).not.toHaveBeenCalled()
  })

  it('returns a typed route block when strict settings read fails instead of choosing environment', async () => {
    const deps = dependencies()
    deps.db.call.mockImplementation(async (method: string) => {
      if (method === 'compatibleProvider.get') return {
        providerInstanceId: 'ocp_provider_12345678', protocolKey: 'openai_chat_compatible', displayName: 'Provider',
        status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null,
      }
      if (method === 'compatibleEndpoint.listRevisions') return [endpoint()]
      if (method === 'settings.getNetworkProxySettingsStrict') throw new Error('corrupt route')
      throw new Error('unexpected method')
    })
    const service = createCompatibleProviderTransportService(deps as any)
    const result = await service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })
    expect(result).toEqual({
      ok: false,
      requestId: 'connection-1',
      error: expect.objectContaining({ code: 'compatible_proxy_route_invalid' }),
    })
    expect(deps.transport.request).not.toHaveBeenCalled()
  })

  it('scopes explicit abort to the owning WebContents', () => {
    const deps = dependencies()
    const service = createCompatibleProviderTransportService(deps as any)
    deps.requests.start({ requestId: 'connection-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 30_000 })
    expect(service.abortConnectionTest({ requestId: 'connection-1', ownerWebContentsId: 8 })).toEqual({ aborted: false })
    expect(service.abortConnectionTest({ requestId: 'connection-1', ownerWebContentsId: 7 })).toEqual({ aborted: true })
  })

  it('returns a typed capacity block without reading DB or evicting active requests', async () => {
    const deps = dependencies()
    deps.requests = createCompatibleRequestRegistry({ maxActiveRequests: 1, maxActivePerOwner: 1 })
    deps.requests.start({ requestId: 'existing', ownerWebContentsId: 8, headersTimeoutMs: 30_000, overallTimeoutMs: 30_000 })
    const service = createCompatibleProviderTransportService(deps as any)
    await expect(service.testConnection({
      providerInstanceId: 'ocp_provider_12345678',
      requestId: 'connection-1',
      ownerWebContentsId: 7,
    })).resolves.toEqual({
      ok: false,
      requestId: 'connection-1',
      error: expect.objectContaining({ code: 'compatible_request_capacity', stage: 'lifecycle' }),
    })
    expect(deps.db.call).not.toHaveBeenCalled()
    expect(deps.requests.activeCount()).toBe(1)
  })
})
