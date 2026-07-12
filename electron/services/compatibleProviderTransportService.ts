import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import type {
  CompatibleEndpointRevision,
  CompatibleProviderInstance,
} from '../../src/shared/provider/openai-chat-compatible/domain'
import { providerInstanceIdSchema } from '../../src/shared/provider/openai-chat-compatible/identity'
import {
  buildCompatibleNetworkError,
  compatibleNetworkErrorFromHttpStatus,
  type CompatibleNetworkErrorEnvelope,
} from '../../src/shared/network/compatibleNetworkError'
import type { CompatibleCredentialService } from '../credentials/compatibleCredentialService'
import {
  readCompatibleResponseBytes,
  type CompatibleProviderTransport,
  type CompatibleProviderTransportDiagnostics,
} from '../net/compatibleProviderTransport'
import type { CompatibleRequestAbortReason, CompatibleRequestRegistry } from '../net/compatibleRequestRegistry'

const CONNECTION_TEST_HEADERS_TIMEOUT_MS = 30_000
const CONNECTION_TEST_OVERALL_TIMEOUT_MS = 30_000
const CONNECTION_TEST_RESPONSE_MAX_BYTES = 1024 * 1024

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

export type CompatibleConnectionTestResult =
  | Readonly<{
      ok: true
      requestId: string
      httpStatus: number
      diagnostics: CompatibleProviderTransportDiagnostics
    }>
  | Readonly<{
      ok: false
      requestId: string
      error: CompatibleNetworkErrorEnvelope
    }>

export type CompatibleProviderTransportService = Readonly<{
  testConnection: (input: Readonly<{
    providerInstanceId: string
    requestId: string
    ownerWebContentsId: number
  }>) => Promise<CompatibleConnectionTestResult>
  abortConnectionTest: (input: Readonly<{
    requestId: string
    ownerWebContentsId: number
  }>) => Readonly<{ aborted: boolean }>
  abortOwner: (ownerWebContentsId: number) => number
  abortAll: () => number
}>

export function createCompatibleProviderTransportService(input: Readonly<{
  db: DbCaller
  credentials: CompatibleCredentialService
  transport: CompatibleProviderTransport
  requests: CompatibleRequestRegistry
}>): CompatibleProviderTransportService {
  return {
    testConnection: async (raw) => {
      let providerInstanceId: ReturnType<typeof providerInstanceIdSchema.parse>
      try {
        providerInstanceId = providerInstanceIdSchema.parse(raw.providerInstanceId)
      } catch {
        return failed(raw.requestId, 'compatible_config_invalid', 'request')
      }
      let handle
      try {
        handle = input.requests.start({
          requestId: raw.requestId,
          ownerWebContentsId: raw.ownerWebContentsId,
          headersTimeoutMs: CONNECTION_TEST_HEADERS_TIMEOUT_MS,
          overallTimeoutMs: CONNECTION_TEST_OVERALL_TIMEOUT_MS,
        })
      } catch (error) {
        return failed(
          raw.requestId,
          error instanceof Error && error.message === 'compatible_request_registry_capacity'
            ? 'compatible_request_capacity'
            : 'compatible_config_invalid',
          'lifecycle',
        )
      }

      try {
        const provider = await input.db.call('compatibleProvider.get', { providerInstanceId }) as CompatibleProviderInstance | null
        if (!provider || provider.status !== 'active') {
          return failed(raw.requestId, 'compatible_config_invalid', 'request')
        }
        const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId }) as readonly CompatibleEndpointRevision[]
        const endpoint = endpoints[0]
        if (!endpoint || endpoint.providerInstanceId !== providerInstanceId) {
          return failed(raw.requestId, 'compatible_config_invalid', 'request')
        }
        let strictProxyResult: Readonly<{ value: unknown }>
        try {
          strictProxyResult = await input.db.call('settings.getNetworkProxySettingsStrict') as Readonly<{ value: unknown }>
        } catch {
          return failed(raw.requestId, 'compatible_proxy_route_invalid', 'request')
        }
        const proxySettings = strictProxyResult.value
        const result = await input.transport.request({
          endpoint,
          operation: 'models',
          proxySettings,
          signal: handle.signal,
          ...(endpoint.credentialVersionRef
            ? { resolveCredential: () => input.credentials.readForMain(endpoint.credentialVersionRef!) }
            : {}),
        })
        if (!result.ok) return abortAwareFailure(raw.requestId, handle.abortReason(), result.error)
        handle.markHeadersReceived()
        try {
          await readCompatibleResponseBytes(result.response, CONNECTION_TEST_RESPONSE_MAX_BYTES, handle.signal)
        } catch (error) {
          if (isNetworkEnvelope(error)) return { ok: false, requestId: raw.requestId, error }
          return abortAwareFailure(raw.requestId, handle.abortReason(), buildCompatibleNetworkError({
            code: 'compatible_network_unknown',
            stage: 'response',
          }))
        }
        if (result.response.status < 200 || result.response.status >= 300) {
          return {
            ok: false,
            requestId: raw.requestId,
            error: compatibleNetworkErrorFromHttpStatus(result.response.status),
          }
        }
        return Object.freeze({
          ok: true,
          requestId: raw.requestId,
          httpStatus: result.response.status,
          diagnostics: result.diagnostics,
        })
      } catch {
        return abortAwareFailure(raw.requestId, handle.abortReason(), buildCompatibleNetworkError({
          code: 'compatible_network_unknown',
          stage: 'request',
        }))
      } finally {
        handle.finish()
      }
    },
    abortConnectionTest: ({ requestId, ownerWebContentsId }) => Object.freeze({
      aborted: input.requests.abortRequestForOwner(requestId, ownerWebContentsId, 'user_abort'),
    }),
    abortOwner: (ownerWebContentsId) => input.requests.abortOwner(ownerWebContentsId, 'window_destroyed'),
    abortAll: () => input.requests.abortAll('app_shutdown'),
  }
}

function abortAwareFailure(
  requestId: string,
  reason: CompatibleRequestAbortReason | null,
  fallback: CompatibleNetworkErrorEnvelope,
): Extract<CompatibleConnectionTestResult, { ok: false }> {
  if (reason === 'headers_timeout' || reason === 'idle_timeout' || reason === 'overall_timeout') {
    return failed(requestId, 'compatible_timeout', 'lifecycle')
  }
  if (reason === 'window_destroyed') return failed(requestId, 'compatible_window_destroyed', 'lifecycle')
  if (reason === 'user_abort' || reason === 'app_shutdown') return failed(requestId, 'compatible_aborted', 'lifecycle')
  return Object.freeze({ ok: false, requestId, error: fallback })
}

function failed(
  requestId: string,
  code: Parameters<typeof buildCompatibleNetworkError>[0]['code'],
  stage: Parameters<typeof buildCompatibleNetworkError>[0]['stage'],
): Extract<CompatibleConnectionTestResult, { ok: false }> {
  return Object.freeze({ ok: false, requestId, error: buildCompatibleNetworkError({ code, stage }) })
}

function isNetworkEnvelope(value: unknown): value is CompatibleNetworkErrorEnvelope {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'stage' in value && 'safeMessage' in value)
}
