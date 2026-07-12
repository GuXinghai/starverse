import { describe, expect, it, vi } from 'vitest'
import type { CompatibleEndpointRevision } from '../../src/shared/provider/openai-chat-compatible/domain'
import { createCompatibleAddressLeaseRegistry } from './compatibleAddressPolicy'
import {
  createCompatibleProviderTransport,
  createNativeCompatibleTransportAdapters,
  iterateCompatibleResponseChunks,
  readCompatibleResponseBytes,
  type CompatibleTransportAdapter,
  type CompatibleTransportKind,
} from './compatibleProviderTransport'

const proxyBase = {
  manualProxyUrl: '',
  noProxy: '',
  strictSSL: true,
} as const

function endpoint(
  securityPolicy: 'compatibility_first' | 'strict_ssrf',
  auth: 'none' | 'bearer' = 'none',
): CompatibleEndpointRevision {
  const credentialVersionRef = auth === 'bearer' ? 'ocp_credential_12345678' : null
  return {
    endpointRevisionId: 'ocp_endpoint_12345678',
    providerInstanceId: 'ocp_provider_12345678',
    revision: 1,
    baseUrl: 'https://api.example/v1',
    allowInsecureHttp: false,
    securityPolicy,
    auth: auth === 'bearer' ? { mode: 'bearer', credentialVersionRef: credentialVersionRef! } : { mode: 'none' },
    credentialVersionRef,
    ordinaryHeaders: [{ name: 'x-client', value: 'Starverse', classification: 'public_non_secret' }],
    sensitiveHeaderRefs: [],
    query: [],
    requestProfileId: 'ocp_request_profile_12345678',
    requestProfileVersion: 1,
    responseProfileId: 'ocp_response_profile_12345678',
    responseProfileVersion: 1,
    createdAtMs: 1,
  } as unknown as CompatibleEndpointRevision
}

function addressPolicy(address = '8.8.8.8') {
  const resolveAll = vi.fn(async () => [{ address, family: 'ipv4' as const }])
  return {
    resolveAll,
    policy: createCompatibleAddressLeaseRegistry({
      resolver: { resolveAll },
      randomId: (() => {
        let index = 0
        return () => `lease-${++index}`
      })(),
    }),
  }
}

function adapters(input?: Partial<Record<CompatibleTransportKind, CompatibleTransportAdapter>>) {
  const electronExecute = vi.fn(async () => new Response('{}', { status: 200 }))
  const nodeExecute = vi.fn(async () => new Response('{}', { status: 200 }))
  return {
    electronExecute,
    nodeExecute,
    value: {
      electron_session_fetch: input?.electron_session_fetch ?? {
        kind: 'electron_session_fetch',
        securityCapability: 'pre_request_audit_only',
        execute: electronExecute,
      },
      node_undici: input?.node_undici ?? {
        kind: 'node_undici',
        securityCapability: 'pre_request_audit_only',
        execute: nodeExecute,
      },
    } as const,
  }
}

function policies(policy: ReturnType<typeof addressPolicy>['policy']) {
  return { electron_session_fetch: policy, node_undici: policy } as const
}

describe('compatibleProviderTransport', () => {
  it.each([
    ['system', 'electron_session_fetch'],
    ['manual', 'node_undici'],
    ['environment', 'node_undici'],
    ['direct', 'node_undici'],
  ] as const)('compatibility_first preserves %s and its native %s transport', async (proxyMode, transportKind) => {
    const addresses = addressPolicy()
    const transportAdapters = adapters()
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    const result = await transport.request({
      endpoint: endpoint('compatibility_first'),
      operation: 'models',
      proxySettings: {
        ...proxyBase,
        proxyMode,
        ...(proxyMode === 'manual' ? { manualProxyUrl: 'http://proxy.example:8080' } : {}),
      },
    })
    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        securityPolicy: 'compatibility_first',
        proxyRoute: proxyMode,
        transportKind,
        transportCapability: 'pre_request_audit_only',
      },
    })
    expect(addresses.resolveAll).toHaveBeenCalledTimes(1)
    expect(addresses.policy.size()).toBe(0)
    expect(transportAdapters.electronExecute).toHaveBeenCalledTimes(proxyMode === 'system' ? 1 : 0)
    expect(transportAdapters.nodeExecute).toHaveBeenCalledTimes(proxyMode === 'system' ? 0 : 1)
  })

  it.each(['system', 'manual', 'environment', 'direct'] as const)(
    'strict_ssrf blocks unsupported %s before DNS, credential resolution or transport execution',
    async (proxyMode) => {
      const addresses = addressPolicy()
      const transportAdapters = adapters()
      const resolveCredential = vi.fn(() => ({ mode: 'bearer' as const, token: 'secret-value' }))
      const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
      const result = await transport.request({
        endpoint: endpoint('strict_ssrf', 'bearer'),
        operation: 'models',
        proxySettings: {
          ...proxyBase,
          proxyMode,
          ...(proxyMode === 'manual' ? { manualProxyUrl: 'http://proxy.example:8080' } : {}),
        },
        resolveCredential,
      })
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'compatible_strict_ssrf_unavailable', stage: 'connect' }),
      })
      expect(addresses.resolveAll).not.toHaveBeenCalled()
      expect(resolveCredential).not.toHaveBeenCalled()
      expect(transportAdapters.electronExecute).not.toHaveBeenCalled()
      expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
    },
  )

  it('strict_ssrf allows an explicitly capable adapter only after exact lease consumption', async () => {
    const addresses = addressPolicy()
    const execute = vi.fn(async (request) => {
      request.lease?.consumeAtConnect(request.lease.value.selectedAddress.address)
      return new Response('{}', { status: 200 })
    }) as CompatibleTransportAdapter['execute']
    const capable: CompatibleTransportAdapter = {
      kind: 'node_undici',
      securityCapability: 'validated_address_lease_v1',
      execute,
    }
    const transportAdapters = adapters({ node_undici: capable })
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    const result = await transport.request({
      endpoint: endpoint('strict_ssrf'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })
    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        securityPolicy: 'strict_ssrf',
        proxyRoute: 'direct',
        transportKind: 'node_undici',
        transportCapability: 'validated_address_lease_v1',
      },
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(addresses.policy.size()).toBe(0)
  })

  it('strict_ssrf rejects a claimed-capable adapter that does not consume its lease', async () => {
    const addresses = addressPolicy()
    const execute = vi.fn(async () => new Response('{}', { status: 200 }))
    const transportAdapters = adapters({
      node_undici: { kind: 'node_undici', securityCapability: 'validated_address_lease_v1', execute },
    })
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('strict_ssrf'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_dns_rebinding_blocked', stage: 'connect' }),
    })
    expect(addresses.policy.size()).toBe(0)
  })

  it('strict_ssrf rejects a capable adapter that attempts to consume a different address', async () => {
    const addresses = addressPolicy()
    const execute = vi.fn(async (request) => {
      request.lease?.consumeAtConnect('127.0.0.1')
      return new Response('{}', { status: 200 })
    }) as CompatibleTransportAdapter['execute']
    const transportAdapters = adapters({
      node_undici: { kind: 'node_undici', securityCapability: 'validated_address_lease_v1', execute },
    })
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('strict_ssrf'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_dns_rebinding_blocked', stage: 'connect' }),
    })
    expect(addresses.policy.size()).toBe(0)
  })

  it('blocks a mixed/private address before credential resolution and connector execution', async () => {
    const resolveAll = vi.fn(async () => [
      { address: '8.8.8.8', family: 'ipv4' as const },
      { address: '127.0.0.1', family: 'ipv4' as const },
    ])
    const policy = createCompatibleAddressLeaseRegistry({ resolver: { resolveAll } })
    const transportAdapters = adapters()
    const resolveCredential = vi.fn(() => ({ mode: 'bearer' as const, token: 'secret-value' }))
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(policy), adapters: transportAdapters.value })
    const result = await transport.request({
      endpoint: endpoint('compatibility_first', 'bearer'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
      resolveCredential,
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_address_blocked', stage: 'dns' }),
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
  })

  it('rejects credential header collisions and CRLF before connector execution', async () => {
    const addresses = addressPolicy()
    const transportAdapters = adapters()
    const value = endpoint('compatibility_first') as any
    value.auth = { mode: 'custom_headers', credentialVersionRef: 'ocp_credential_12345678' }
    value.credentialVersionRef = 'ocp_credential_12345678'
    value.ordinaryHeaders = [{ name: 'x-tenant', value: 'public', classification: 'public_non_secret' }]
    value.sensitiveHeaderRefs = [{ name: 'x-tenant', credentialVersionRef: 'ocp_credential_12345678' }]
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: value,
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
      resolveCredential: () => ({ mode: 'custom_headers', headers: [{ name: 'x-tenant', value: 'secret' }] }),
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_header_forbidden', stage: 'headers' }),
    })
    expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
  })

  it('enforces the aggregate header bound when authentication is disabled', async () => {
    const addresses = addressPolicy()
    const transportAdapters = adapters()
    const value = endpoint('compatibility_first') as any
    value.ordinaryHeaders = Array.from({ length: 17 }, (_, index) => ({
      name: `x-large-${index}`,
      value: '.'.repeat(8192),
      classification: 'public_non_secret',
    }))
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: value,
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_header_forbidden', stage: 'headers' }),
    })
    expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
  })

  it('maps credential resolver exceptions to a fixed missing-credential error', async () => {
    const addresses = addressPolicy()
    const transportAdapters = adapters()
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('compatibility_first', 'bearer'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
      resolveCredential: () => { throw new Error('safeStorage secret backend failure') },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_credential_missing', stage: 'headers' }),
    })
    expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
  })

  it('rechecks every redirect, preserves POST/body/route and strips cross-origin credentials monotonically', async () => {
    const addresses = addressPolicy()
    const calls: any[] = []
    const execute = vi.fn(async (request) => {
      calls.push(request)
      return calls.length === 1
        ? new Response(null, { status: 307, headers: { location: 'https://edge.example/v1/chat/completions' } })
        : new Response('{}', { status: 200 })
    })
    const transportAdapters = adapters({
      node_undici: { kind: 'node_undici', securityCapability: 'pre_request_audit_only', execute },
    })
    const resolveCredential = vi.fn(() => ({ mode: 'bearer' as const, token: 'secret-value' }))
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    const result = await transport.request({
      endpoint: endpoint('compatibility_first', 'bearer'),
      operation: 'chat_completions',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
      body: '{"model":"m","messages":[]}',
      resolveCredential,
    })
    expect(result).toMatchObject({ ok: true, diagnostics: { proxyRoute: 'direct', redirectCount: 1 } })
    expect(addresses.resolveAll).toHaveBeenCalledTimes(2)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ method: 'POST', body: '{"model":"m","messages":[]}' })
    expect(calls[0].headers.authorization).toBe('Bearer secret-value')
    expect(calls[1]).toMatchObject({ method: 'POST', body: '{"model":"m","messages":[]}' })
    expect(calls[1].headers).not.toHaveProperty('authorization')
    expect(resolveCredential).toHaveBeenCalledTimes(1)
  })

  it('reports an insecure HTTP redirect even when the configured endpoint starts as HTTPS', async () => {
    const addresses = addressPolicy()
    let call = 0
    const transportAdapters = adapters({
      node_undici: {
        kind: 'node_undici',
        securityCapability: 'pre_request_audit_only',
        execute: vi.fn(async () => ++call === 1
          ? new Response(null, { status: 302, headers: { location: 'http://edge.example/v1/models' } })
          : new Response('{}', { status: 200 })),
      },
    })
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('compatibility_first'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })).resolves.toMatchObject({ ok: true, diagnostics: { insecureHttp: true, redirectCount: 1 } })
  })

  it('rejects a corrupt proxy route instead of normalizing or invoking either transport', async () => {
    const addresses = addressPolicy()
    const transportAdapters = adapters()
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('compatibility_first'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'browser_compatible' },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_proxy_route_invalid' }),
    })
    expect(addresses.resolveAll).not.toHaveBeenCalled()
    expect(transportAdapters.electronExecute).not.toHaveBeenCalled()
    expect(transportAdapters.nodeExecute).not.toHaveBeenCalled()
  })

  it('bounds buffered response bytes and cancels overflow', async () => {
    await expect(readCompatibleResponseBytes(new Response('12345'), 5).then((value) => [...value])).resolves.toEqual([49, 50, 51, 52, 53])
    await expect(readCompatibleResponseBytes(new Response('123456'), 5)).rejects.toMatchObject({
      code: 'compatible_response_overflow',
      stage: 'response',
    })
  })

  it('rejects oversized response headers before returning the body', async () => {
    const addresses = addressPolicy()
    const headers = new Headers()
    for (let index = 0; index < 140; index += 1) headers.set(`x-large-${index}`, 'x'.repeat(1024))
    const transportAdapters = adapters({
      node_undici: {
        kind: 'node_undici',
        securityCapability: 'pre_request_audit_only',
        execute: vi.fn(async () => new Response('secret-body', { status: 200, headers })),
      },
    })
    const transport = createCompatibleProviderTransport({ addressPolicies: policies(addresses.policy), adapters: transportAdapters.value })
    await expect(transport.request({
      endpoint: endpoint('compatibility_first'),
      operation: 'models',
      proxySettings: { ...proxyBase, proxyMode: 'direct' },
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'compatible_response_overflow', stage: 'response' }),
    })
  })

  it('bounds cumulative streamed bytes and arms/clears idle timeout around every read', async () => {
    const armIdleTimeout = vi.fn()
    const clearIdleTimeout = vi.fn()
    const chunks: number[][] = []
    for await (const chunk of iterateCompatibleResponseChunks(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3]))
        controller.close()
      },
    })), { maxCumulativeBytes: 3, armIdleTimeout, clearIdleTimeout })) {
      chunks.push([...chunk])
    }
    expect(chunks).toEqual([[1, 2], [3]])
    expect(armIdleTimeout).toHaveBeenCalledTimes(3)
    expect(clearIdleTimeout.mock.calls.length).toBeGreaterThanOrEqual(3)

    const overflow = iterateCompatibleResponseChunks(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
      },
    })), { maxCumulativeBytes: 3, armIdleTimeout: vi.fn(), clearIdleTimeout: vi.fn() })
    await expect(async () => {
      for await (const _chunk of overflow) { /* consume */ }
    }).rejects.toMatchObject({ code: 'compatible_sse_overflow', stage: 'stream' })
  })

  it('bounds a single SSE event across chunks and resets only at a blank event boundary', async () => {
    const overflow = iterateCompatibleResponseChunks(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'))
        controller.enqueue(new TextEncoder().encode(':x\n\n'))
      },
    })), {
      maxCumulativeBytes: 64,
      maxEventBytes: 7,
      maxPendingBufferBytes: 16,
      armIdleTimeout: vi.fn(),
      clearIdleTimeout: vi.fn(),
    })
    await expect(async () => {
      for await (const _chunk of overflow) { /* consume */ }
    }).rejects.toMatchObject({ code: 'compatible_sse_overflow', stage: 'stream' })

    const chunks: string[] = []
    for await (const chunk of iterateCompatibleResponseChunks(new Response('x\n\ny\n\n'), {
      maxCumulativeBytes: 16,
      maxEventBytes: 3,
      maxPendingBufferBytes: 3,
      armIdleTimeout: vi.fn(),
      clearIdleTimeout: vi.fn(),
    })) chunks.push(new TextDecoder().decode(chunk))
    expect(chunks.join('')).toBe('x\n\ny\n\n')
  })

  it('bounds an unterminated SSE pending line independently of the cumulative limit', async () => {
    const overflow = iterateCompatibleResponseChunks(new Response('data:pending'), {
      maxCumulativeBytes: 64,
      maxEventBytes: 64,
      maxPendingBufferBytes: 4,
      armIdleTimeout: vi.fn(),
      clearIdleTimeout: vi.fn(),
    })
    await expect(async () => {
      for await (const _chunk of overflow) { /* consume */ }
    }).rejects.toMatchObject({ code: 'compatible_sse_overflow', stage: 'stream' })
  })

  it('native adapters keep manual redirects and never claim strict lease capability', async () => {
    const electronSessionFetch = vi.fn(async () => new Response('{}'))
    const nodeFetch = vi.fn(async () => new Response('{}'))
    const native = createNativeCompatibleTransportAdapters({ electronSessionFetch, nodeFetch })
    const request = {
      url: new URL('https://api.example/v1/models'),
      method: 'GET' as const,
      headers: { accept: 'application/json' },
    }
    await native.electron_session_fetch.execute(request)
    await native.node_undici.execute({ ...request, dispatcher: { marker: true } })
    expect(native.electron_session_fetch.securityCapability).toBe('pre_request_audit_only')
    expect(native.node_undici.securityCapability).toBe('pre_request_audit_only')
    expect(electronSessionFetch).toHaveBeenCalledWith(request.url.toString(), expect.objectContaining({ redirect: 'manual', credentials: 'omit' }))
    expect(nodeFetch).toHaveBeenCalledWith(request.url, expect.objectContaining({ redirect: 'manual', credentials: 'omit', dispatcher: { marker: true } }))
  })
})
