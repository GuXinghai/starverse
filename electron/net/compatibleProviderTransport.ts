import { Buffer } from 'node:buffer'
import { fetch as undiciFetch } from 'undici'
import type { CompatibleEndpointRevision } from '../../src/shared/provider/openai-chat-compatible/domain'
import type { CompatibleRegistryCredentialInput } from '../../src/shared/provider/openai-chat-compatible/registry/registrySchemas'
import {
  compatibleOrdinaryHeadersSchema,
  compatibleSensitiveHeaderRefsSchema,
} from '../../src/shared/provider/openai-chat-compatible/schemas'
import {
  buildCompatibleNetworkError,
  type CompatibleNetworkErrorEnvelope,
} from '../../src/shared/network/compatibleNetworkError'
import type { NetworkProxySettings } from '../../src/shared/plugin-distribution/networkProxyShared'
import {
  CompatibleAddressPolicyError,
  type CompatibleAddressLeaseRegistry,
  type ValidatedAddressLease,
} from './compatibleAddressPolicy'
import {
  CompatibleProxyRouteError,
  selectCompatibleTransport,
  type CompatibleSelectedTransport,
  type CompatibleTransportKind,
} from './compatibleProxyRoute'
import {
  advanceCompatibleRedirect,
  CompatibleRedirectPolicyError,
  createCompatibleRedirectState,
} from './compatibleRedirectPolicy'
import { composeCompatibleProviderUrl, type CompatibleProviderOperation } from './compatibleProviderUrl'

export type { CompatibleTransportKind } from './compatibleProxyRoute'

export type CompatibleTransportSecurityCapability = 'pre_request_audit_only' | 'validated_address_lease_v1'

export type CompatibleTransportAdapterRequest = Readonly<{
  url: URL
  method: 'GET' | 'POST'
  headers: Readonly<Record<string, string>>
  body?: string | Uint8Array
  signal?: AbortSignal
  dispatcher?: unknown
  lease?: Readonly<{
    value: ValidatedAddressLease
    consumeAtConnect: (actualAddress: string) => void
  }>
}>

export type CompatibleTransportAdapter = Readonly<{
  kind: CompatibleTransportKind
  securityCapability: CompatibleTransportSecurityCapability
  execute: (request: CompatibleTransportAdapterRequest) => Promise<Response>
}>

export type CompatibleProviderTransportDiagnostics = Readonly<{
  securityPolicy: CompatibleEndpointRevision['securityPolicy']
  proxyRoute: NetworkProxySettings['proxyMode']
  transportKind: CompatibleTransportKind
  transportCapability: CompatibleTransportSecurityCapability
  proxyBypassed: boolean
  redirectCount: number
  insecureHttp: boolean
}>

export type CompatibleProviderTransportResult =
  | Readonly<{
      ok: true
      response: Response
      diagnostics: CompatibleProviderTransportDiagnostics
    }>
  | Readonly<{
      ok: false
      error: CompatibleNetworkErrorEnvelope
    }>

export type CompatibleProviderTransport = Readonly<{
  preflight: (input: Readonly<{
    endpoint: CompatibleEndpointRevision
    operation: CompatibleProviderOperation
    proxySettings: unknown
  }>) => Promise<CompatibleProviderTransportResult | Readonly<{ ok: true }>>
  request: (input: Readonly<{
    endpoint: CompatibleEndpointRevision
    operation: CompatibleProviderOperation
    proxySettings: unknown
    body?: string | Uint8Array
    signal?: AbortSignal
    resolveCredential?: () => CompatibleRegistryCredentialInput
  }>) => Promise<CompatibleProviderTransportResult>
}>

type FetchWithDispatcher = (
  input: string | URL,
  init?: RequestInit & Readonly<{ dispatcher?: unknown }>,
) => Promise<Response>

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_REQUEST_HEADER_BYTES = 128 * 1024
const MAX_RESPONSE_HEADER_BYTES = 128 * 1024
const MAX_RESPONSE_HEADER_COUNT = 256
export const COMPATIBLE_SSE_EVENT_MAX_BYTES = 1024 * 1024
export const COMPATIBLE_SSE_PENDING_BUFFER_MAX_BYTES = 2 * 1024 * 1024
export const COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES = 16 * 1024 * 1024
export const COMPATIBLE_STREAM_RESPONSE_MAX_BYTES = 64 * 1024 * 1024

export function createNativeCompatibleTransportAdapters(input: Readonly<{
  electronSessionFetch: (input: string, init?: RequestInit) => Promise<Response>
  nodeFetch?: FetchWithDispatcher
}>): Readonly<Record<CompatibleTransportKind, CompatibleTransportAdapter>> {
  const nodeFetch = input.nodeFetch ?? (undiciFetch as unknown as FetchWithDispatcher)
  return Object.freeze({
    electron_session_fetch: Object.freeze({
      kind: 'electron_session_fetch' as const,
      securityCapability: 'pre_request_audit_only' as const,
      execute: (request: CompatibleTransportAdapterRequest) => input.electronSessionFetch(request.url.toString(), toFetchInit(request, false)),
    }),
    node_undici: Object.freeze({
      kind: 'node_undici' as const,
      securityCapability: 'pre_request_audit_only' as const,
      execute: (request: CompatibleTransportAdapterRequest) => nodeFetch(request.url, toFetchInit(request, true)),
    }),
  })
}

export function createCompatibleProviderTransport(input: Readonly<{
  addressPolicies: Readonly<Record<CompatibleTransportKind, CompatibleAddressLeaseRegistry>>
  adapters: Readonly<Record<CompatibleTransportKind, CompatibleTransportAdapter>>
}>): CompatibleProviderTransport {
  return {
    preflight: async (request) => {
      try {
        const composed = composeCompatibleProviderUrl(request.endpoint, request.operation)
        const selected = selectCompatibleTransport(request.proxySettings, composed.url)
        const adapter = input.adapters[selected.transportKind]
        const addressPolicy = input.addressPolicies[selected.transportKind]
        if (!adapter || adapter.kind !== selected.transportKind || !addressPolicy) return failure('compatible_transport_unavailable', 'request')
        if (request.endpoint.securityPolicy === 'strict_ssrf') {
          if (adapter.securityCapability !== 'validated_address_lease_v1') return failure('compatible_strict_ssrf_unavailable', 'connect')
          const lease = await addressPolicy.issue(composed.url)
          addressPolicy.revoke(lease.leaseId)
        } else {
          await addressPolicy.audit(composed.url)
        }
        return Object.freeze({ ok: true as const })
      } catch (error) {
        return mapFailure(error)
      }
    },
    request: async (request) => {
      try {
        const composed = composeCompatibleProviderUrl(request.endpoint, request.operation)
        const method = request.operation === 'models' ? 'GET' : 'POST'
        assertBodyContract(method, request.body)
        let redirect = createCompatibleRedirectState({ url: composed.url, method })
        let credential: CompatibleRegistryCredentialInput | undefined
        let insecureHttpSeen = composed.insecureHttp

        while (true) {
          insecureHttpSeen ||= redirect.currentUrl.protocol === 'http:'
          const selected = selectCompatibleTransport(request.proxySettings, redirect.currentUrl)
          const adapter = input.adapters[selected.transportKind]
          const addressPolicy = input.addressPolicies[selected.transportKind]
          if (!adapter || adapter.kind !== selected.transportKind || !addressPolicy) {
            return failure('compatible_transport_unavailable', 'request')
          }

          let leaseContext: CompatibleTransportAdapterRequest['lease']
          let leaseConsumed = false
          if (request.endpoint.securityPolicy === 'strict_ssrf') {
            if (adapter.securityCapability !== 'validated_address_lease_v1') {
              return failure('compatible_strict_ssrf_unavailable', 'connect')
            }
            const lease = await addressPolicy.issue(redirect.currentUrl)
            leaseContext = Object.freeze({
              value: lease,
              consumeAtConnect: (actualAddress: string) => {
                addressPolicy.consume({
                  leaseId: lease.leaseId,
                  hostname: lease.hostname,
                  port: lease.port,
                  address: actualAddress,
                })
                leaseConsumed = true
              },
            })
          } else {
            await addressPolicy.audit(redirect.currentUrl)
          }

          if (credential === undefined && request.endpoint.auth.mode !== 'none') {
            credential = resolveAndValidateCredential(request.endpoint, request.resolveCredential)
          }
          const headers = buildHeaders(request.endpoint, credential, redirect.credentialForwardingAllowed, method)
          let response: Response
          try {
            response = await adapter.execute({
              url: redirect.currentUrl,
              method,
              headers,
              ...(request.body !== undefined ? { body: request.body } : {}),
              ...(request.signal ? { signal: request.signal } : {}),
              ...(selected.dispatcher ? { dispatcher: selected.dispatcher } : {}),
              ...(leaseContext ? { lease: leaseContext } : {}),
            })
          } catch (error) {
            if (leaseContext && !leaseConsumed) addressPolicy.revoke(leaseContext.value.leaseId)
            if (error instanceof CompatibleAddressPolicyError) return mapFailure(error)
            if (isAbortError(error) || request.signal?.aborted) return failure('compatible_aborted', 'lifecycle')
            return failure('compatible_network_proxy_tls', 'request')
          }
          if (leaseContext && !leaseConsumed) {
            addressPolicy.revoke(leaseContext.value.leaseId)
            await cancelResponse(response)
            return failure('compatible_dns_rebinding_blocked', 'connect')
          }
          if (!compatibleResponseHeadersWithinBounds(response.headers)) {
            await cancelResponse(response)
            return failure('compatible_response_overflow', 'response')
          }

          if (!isRedirectStatus(response.status)) {
            return Object.freeze({
              ok: true,
              response,
              diagnostics: diagnostics(request.endpoint, selected, adapter, redirect.redirectCount, insecureHttpSeen),
            })
          }

          const location = response.headers.get('location')
          await cancelResponse(response)
          redirect = advanceCompatibleRedirect(redirect, { status: response.status, location: location ?? '' })
        }
      } catch (error) {
        return mapFailure(error)
      }
    },
  }
}

export async function readCompatibleResponseBytes(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) {
    throw buildCompatibleNetworkError({ code: 'compatible_response_overflow', stage: 'response' })
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal?.aborted) throw buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
      const item = await reader.read()
      if (item.done) break
      total += item.value.byteLength
      if (total > maxBytes) throw buildCompatibleNetworkError({ code: 'compatible_response_overflow', stage: 'response' })
      chunks.push(item.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export async function* iterateCompatibleResponseChunks(
  response: Response,
  input: Readonly<{
    signal?: AbortSignal
    maxCumulativeBytes?: number
    maxEventBytes?: number
    maxPendingBufferBytes?: number
    armIdleTimeout: () => void
    clearIdleTimeout: () => void
  }>,
): AsyncGenerator<Uint8Array> {
  const maxCumulativeBytes = input.maxCumulativeBytes ?? COMPATIBLE_STREAM_RESPONSE_MAX_BYTES
  if (!Number.isInteger(maxCumulativeBytes) || maxCumulativeBytes < 1 || maxCumulativeBytes > COMPATIBLE_STREAM_RESPONSE_MAX_BYTES) {
    throw buildCompatibleNetworkError({ code: 'compatible_sse_overflow', stage: 'stream' })
  }
  const byteLimits = createCompatibleSseByteLimitTracker({
    maxEventBytes: input.maxEventBytes,
    maxPendingBufferBytes: input.maxPendingBufferBytes,
  })
  if (!response.body) return
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      if (input.signal?.aborted) throw buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
      input.armIdleTimeout()
      const item = await reader.read()
      input.clearIdleTimeout()
      if (item.done) break
      total += item.value.byteLength
      if (total > maxCumulativeBytes) {
        throw buildCompatibleNetworkError({ code: 'compatible_sse_overflow', stage: 'stream' })
      }
      byteLimits.push(item.value)
      yield item.value
    }
  } catch (error) {
    input.clearIdleTimeout()
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    input.clearIdleTimeout()
    reader.releaseLock()
  }
}

export function createCompatibleSseByteLimitTracker(input?: Readonly<{
  maxEventBytes?: number
  maxPendingBufferBytes?: number
}>): Readonly<{ push: (chunk: Uint8Array) => void }> {
  const maxEventBytes = input?.maxEventBytes ?? COMPATIBLE_SSE_EVENT_MAX_BYTES
  const maxPendingBufferBytes = input?.maxPendingBufferBytes ?? COMPATIBLE_SSE_PENDING_BUFFER_MAX_BYTES
  assertSseLimit(maxEventBytes, COMPATIBLE_SSE_EVENT_MAX_BYTES)
  assertSseLimit(maxPendingBufferBytes, COMPATIBLE_SSE_PENDING_BUFFER_MAX_BYTES)
  let eventBytes = 0
  let pendingLineBytes = 0
  let lineHasPayload = false
  return Object.freeze({
    push: (chunk) => {
      for (const byte of chunk) {
        eventBytes += 1
        pendingLineBytes += 1
        if (eventBytes > maxEventBytes || pendingLineBytes > maxPendingBufferBytes) {
          throw buildCompatibleNetworkError({ code: 'compatible_sse_overflow', stage: 'stream' })
        }
        if (byte !== 0x0a) {
          if (byte !== 0x0d) lineHasPayload = true
          continue
        }
        pendingLineBytes = 0
        if (!lineHasPayload) eventBytes = 0
        lineHasPayload = false
      }
    },
  })
}

function assertSseLimit(value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw buildCompatibleNetworkError({ code: 'compatible_sse_overflow', stage: 'stream' })
  }
}

function toFetchInit(request: CompatibleTransportAdapterRequest, includeDispatcher: boolean): RequestInit & { dispatcher?: unknown } {
  return {
    method: request.method,
    headers: { ...request.headers },
    redirect: 'manual',
    credentials: 'omit',
    ...(request.body !== undefined ? { body: request.body as BodyInit } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    ...(includeDispatcher && request.dispatcher ? { dispatcher: request.dispatcher } : {}),
  }
}

function buildHeaders(
  endpoint: CompatibleEndpointRevision,
  credential: CompatibleRegistryCredentialInput | undefined,
  credentialForwardingAllowed: boolean,
  method: 'GET' | 'POST',
): Readonly<Record<string, string>> {
  const ordinary = compatibleOrdinaryHeadersSchema.parse(endpoint.ordinaryHeaders)
  const headers: Record<string, string> = {
    accept: method === 'POST' ? 'text/event-stream, application/json' : 'application/json',
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
  }
  for (const entry of ordinary) headers[entry.name.toLowerCase()] = entry.value
  if (credentialForwardingAllowed && endpoint.auth.mode !== 'none') {
    if (!credential || credential.mode !== endpoint.auth.mode) throw new Error('compatible_auth_invalid')
    if (credential.mode === 'bearer') {
      if (/\r|\n/u.test(credential.token)) throw new Error('compatible_auth_invalid')
      headers.authorization = `Bearer ${credential.token}`
    } else if (credential.mode === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${credential.username}:${credential.password}`, 'utf8').toString('base64')}`
    } else if (credential.mode === 'custom_headers') {
      const refs = compatibleSensitiveHeaderRefsSchema.parse(endpoint.sensitiveHeaderRefs)
      const expected = [...refs].map((entry) => entry.name.toLowerCase()).sort()
      const actual = credential.headers.map((entry) => entry.name.trim().toLowerCase()).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('compatible_auth_invalid')
      for (const entry of credential.headers) {
        if (/\r|\n/u.test(entry.value)) throw new Error('compatible_auth_invalid')
        const name = entry.name.trim().toLowerCase()
        if (Object.prototype.hasOwnProperty.call(headers, name)) throw new Error('compatible_header_forbidden')
        headers[name] = entry.value
      }
    }
  }
  const headerBytes = Object.entries(headers).reduce(
    (total, [name, value]) => total + Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8') + 4,
    0,
  )
  if (headerBytes > MAX_REQUEST_HEADER_BYTES) throw new Error('compatible_header_forbidden')
  return Object.freeze(headers)
}

function resolveAndValidateCredential(
  endpoint: CompatibleEndpointRevision,
  resolver: (() => CompatibleRegistryCredentialInput) | undefined,
): CompatibleRegistryCredentialInput {
  if (!resolver) throw new Error('compatible_credential_missing')
  let credential: CompatibleRegistryCredentialInput
  try {
    credential = resolver()
  } catch {
    throw new Error('compatible_credential_missing')
  }
  if (credential.mode !== endpoint.auth.mode) throw new Error('compatible_auth_invalid')
  return credential
}

function assertBodyContract(method: 'GET' | 'POST', body: string | Uint8Array | undefined): void {
  if (method === 'GET' && body !== undefined) throw new Error('compatible_url_invalid')
  if (method === 'POST' && body === undefined) throw new Error('compatible_url_invalid')
  if (body !== undefined) {
    const bytes = typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.byteLength
    if (bytes > MAX_REQUEST_BODY_BYTES) throw new Error('compatible_response_overflow')
  }
}

function diagnostics(
  endpoint: CompatibleEndpointRevision,
  selected: CompatibleSelectedTransport,
  adapter: CompatibleTransportAdapter,
  redirectCount: number,
  insecureHttp: boolean,
): CompatibleProviderTransportDiagnostics {
  return Object.freeze({
    securityPolicy: endpoint.securityPolicy,
    proxyRoute: selected.proxyRoute,
    transportKind: selected.transportKind,
    transportCapability: adapter.securityCapability,
    proxyBypassed: selected.bypassed,
    redirectCount,
    insecureHttp,
  })
}

function mapFailure(error: unknown): Extract<CompatibleProviderTransportResult, { ok: false }> {
  if (error instanceof CompatibleAddressPolicyError) {
    if (error.code === 'compatible_address_blocked') return failure('compatible_address_blocked', 'dns')
    if (error.code === 'compatible_dns_rebinding_blocked') return failure('compatible_dns_rebinding_blocked', 'connect')
    return failure('compatible_network_proxy_tls', 'dns')
  }
  if (error instanceof CompatibleRedirectPolicyError) return failure('compatible_redirect_blocked', 'redirect')
  if (error instanceof CompatibleProxyRouteError) return failure(error.code, 'request')
  const token = error instanceof Error ? error.message : ''
  if (token === 'compatible_credential_missing') return failure('compatible_credential_missing', 'headers')
  if (token === 'compatible_auth_invalid') return failure('compatible_auth_invalid', 'headers')
  if (token === 'compatible_header_forbidden') return failure('compatible_header_forbidden', 'headers')
  if (token === 'compatible_url_invalid') return failure('compatible_url_invalid', 'url')
  if (token === 'compatible_response_overflow') return failure('compatible_response_overflow', 'request')
  return failure('compatible_network_unknown', 'request')
}

function failure(
  code: Parameters<typeof buildCompatibleNetworkError>[0]['code'],
  stage: Parameters<typeof buildCompatibleNetworkError>[0]['stage'],
): Extract<CompatibleProviderTransportResult, { ok: false }> {
  return Object.freeze({ ok: false, error: buildCompatibleNetworkError({ code, stage }) })
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && /abort|cancel/iu.test(`${error.name} ${error.message}`)
}

async function cancelResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

function compatibleResponseHeadersWithinBounds(headers: Headers): boolean {
  let count = 0
  let bytes = 0
  for (const [name, value] of headers.entries()) {
    count += 1
    bytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8') + 4
    if (count > MAX_RESPONSE_HEADER_COUNT || bytes > MAX_RESPONSE_HEADER_BYTES) return false
  }
  return true
}
