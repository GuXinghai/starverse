import { createHash, randomUUID } from 'node:crypto'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import {
  catalogSnapshotIdSchema,
  compatibleCatalogSyncDiagnosticsSchema,
  compatibleModelMetadataSchema,
  providerInstanceIdSchema,
  type CompatibleCatalogSyncState,
  type CompatibleEndpointRevision,
  type CompatibleMergedModel,
  type CompatibleProviderInstance,
} from '../../src/shared/provider/openai-chat-compatible'
import {
  CompatibleCatalogSourceError,
  parseCompatibleModelsResponse,
  type CompatibleCatalogSourceDiagnostics,
} from '../../src/shared/modelCatalog/providers/openai-chat-compatible/compatibleCatalogSource'
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

const CATALOG_HEADERS_TIMEOUT_MS = 30_000
const CATALOG_OVERALL_TIMEOUT_MS = 30_000
const CATALOG_RESPONSE_MAX_BYTES = 1024 * 1024
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 60 * 60 * 1000

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

export type CompatibleCatalogSyncResult =
  | Readonly<{
      ok: true
      requestId: string
      providerInstanceId: string
      snapshotId: string
      status: 'success' | 'empty_success'
      models: readonly CompatibleMergedModel[]
      syncState: CompatibleCatalogSyncState
      sourceDiagnostics: CompatibleCatalogSourceDiagnostics
      transportDiagnostics: CompatibleProviderTransportDiagnostics
    }>
  | Readonly<{
      ok: false
      requestId: string
      providerInstanceId: string
      error: CompatibleNetworkErrorEnvelope
      syncState: CompatibleCatalogSyncState | null
    }>

export type CompatibleCatalogSyncService = Readonly<{
  sync: (input: Readonly<{
    providerInstanceId: string
    requestId: string
    ownerWebContentsId: number
    force: boolean
  }>) => Promise<CompatibleCatalogSyncResult>
  abortSync: (input: Readonly<{ requestId: string; ownerWebContentsId: number }>) => Readonly<{ aborted: boolean }>
  abortOwner: (ownerWebContentsId: number) => number
  abortAll: () => number
}>

export type CompatibleCatalogStartupSyncSummary = Readonly<{
  considered: number
  attempted: number
  succeeded: number
  failed: number
}>

export async function runCompatibleCatalogStartupSync(input: Readonly<{
  db: DbCaller
  service: CompatibleCatalogSyncService
  nowMs?: () => number
  maxProviders?: number
  freshnessMs?: number
  randomSuffix?: () => string
}>): Promise<CompatibleCatalogStartupSyncSummary> {
  const nowMs = input.nowMs ?? Date.now
  const maxProviders = input.maxProviders ?? 3
  const freshnessMs = input.freshnessMs ?? 15 * 60 * 1000
  if (!Number.isInteger(maxProviders) || maxProviders < 1 || maxProviders > 10 ||
    !Number.isInteger(freshnessMs) || freshnessMs < 60_000 || freshnessMs > 24 * 60 * 60 * 1000) {
    throw new Error('compatible_catalog_startup_policy_invalid')
  }
  const providers = await input.db.call('compatibleProvider.list', { includeDeleted: false }) as readonly CompatibleProviderInstance[]
  const candidates: CompatibleProviderInstance[] = []
  const atMs = nowMs()
  for (const provider of providers) {
    if (provider.status !== 'active') continue
    const state = await input.db.call('compatibleCatalog.getSyncState', { providerInstanceId: provider.providerInstanceId }) as CompatibleCatalogSyncState | null
    if (state?.status === 'backoff' && (state.backoffUntilMs ?? 0) > atMs) continue
    if (state?.lastSuccessAtMs !== null && state?.lastSuccessAtMs !== undefined && atMs - state.lastSuccessAtMs < freshnessMs) continue
    candidates.push(provider)
    if (candidates.length >= maxProviders) break
  }
  let succeeded = 0
  let failed = 0
  for (const provider of candidates) {
    const suffix = (input.randomSuffix?.() ?? randomUUID().replace(/-/gu, '')).slice(0, 64)
    const result = await input.service.sync({
      providerInstanceId: provider.providerInstanceId,
      requestId: `catalog-startup-${suffix}`,
      ownerWebContentsId: 2_147_483_647,
      force: false,
    })
    if (result.ok) succeeded += 1
    else failed += 1
  }
  return Object.freeze({ considered: providers.length, attempted: candidates.length, succeeded, failed })
}

export function createCompatibleCatalogSyncService(input: Readonly<{
  db: DbCaller
  credentials: CompatibleCredentialService
  transport: CompatibleProviderTransport
  requests: CompatibleRequestRegistry
  nowMs?: () => number
  randomSuffix?: () => string
}>): CompatibleCatalogSyncService {
  const nowMs = input.nowMs ?? Date.now
  const randomSuffix = input.randomSuffix ?? (() => randomUUID().replace(/-/gu, ''))
  const activeByProvider = new Map<string, string>()

  return {
    sync: async (raw) => {
      let providerInstanceId: ReturnType<typeof providerInstanceIdSchema.parse>
      try {
        providerInstanceId = providerInstanceIdSchema.parse(raw.providerInstanceId)
      } catch {
        return failed(raw.requestId, raw.providerInstanceId, 'compatible_config_invalid', 'request', null)
      }
      if (activeByProvider.has(providerInstanceId)) {
        return failed(raw.requestId, providerInstanceId, 'compatible_catalog_sync_failed', 'lifecycle', null)
      }
      let handle
      try {
        handle = input.requests.start({
          requestId: raw.requestId,
          ownerWebContentsId: raw.ownerWebContentsId,
          headersTimeoutMs: CATALOG_HEADERS_TIMEOUT_MS,
          overallTimeoutMs: CATALOG_OVERALL_TIMEOUT_MS,
        })
      } catch (error) {
        return failed(
          raw.requestId,
          providerInstanceId,
          error instanceof Error && error.message === 'compatible_request_registry_capacity'
            ? 'compatible_request_capacity'
            : 'compatible_config_invalid',
          'lifecycle',
          null,
        )
      }
      activeByProvider.set(providerInstanceId, raw.requestId)
      let lastState: CompatibleCatalogSyncState | null = null
      try {
        const provider = await input.db.call('compatibleProvider.get', { providerInstanceId }) as CompatibleProviderInstance | null
        if (!provider || provider.status !== 'active') {
          return failed(raw.requestId, providerInstanceId, 'compatible_config_invalid', 'request', null)
        }
        lastState = await input.db.call('compatibleCatalog.getSyncState', { providerInstanceId }) as CompatibleCatalogSyncState | null
        const startedAtMs = nowMs()
        if (!raw.force && lastState?.status === 'backoff' && (lastState.backoffUntilMs ?? 0) > startedAtMs) {
          return failed(raw.requestId, providerInstanceId, 'compatible_catalog_sync_failed', 'lifecycle', lastState)
        }
        const endpoints = await input.db.call('compatibleEndpoint.listRevisions', { providerInstanceId }) as readonly CompatibleEndpointRevision[]
        const endpoint = endpoints[0]
        if (!endpoint || endpoint.providerInstanceId !== providerInstanceId) {
          return failed(raw.requestId, providerInstanceId, 'compatible_config_invalid', 'request', lastState)
        }
        let proxySettings: unknown
        try {
          proxySettings = (await input.db.call('settings.getNetworkProxySettingsStrict') as Readonly<{ value: unknown }>).value
        } catch {
          return await failAndRecord('compatible_proxy_route_invalid', 'request', false, null)
        }
        lastState = await input.db.call('compatibleCatalog.markSyncing', { providerInstanceId, attemptedAtMs: startedAtMs }) as CompatibleCatalogSyncState
        const transportResult = await input.transport.request({
          endpoint,
          operation: 'models',
          proxySettings,
          signal: handle.signal,
          ...(endpoint.credentialVersionRef
            ? { resolveCredential: () => input.credentials.readForMain(endpoint.credentialVersionRef!) }
            : {}),
        })
        if (!transportResult.ok) {
          const abortError = abortErrorFor(handle.abortReason())
          const error = abortError ?? transportResult.error
          return await failAndRecord(error.code, error.stage, error.retryable, error.httpStatus ?? null, error)
        }
        handle.markHeadersReceived()
        if (transportResult.response.status < 200 || transportResult.response.status >= 300) {
          const error = compatibleNetworkErrorFromHttpStatus(transportResult.response.status)
          await transportResult.response.body?.cancel().catch(() => undefined)
          return await failAndRecord(error.code, error.stage, error.retryable, error.httpStatus ?? null, error)
        }
        let bytes: Uint8Array
        try {
          bytes = await readCompatibleResponseBytes(transportResult.response, CATALOG_RESPONSE_MAX_BYTES, handle.signal)
        } catch (error) {
          const envelope = isNetworkEnvelope(error)
            ? error
            : abortErrorFor(handle.abortReason()) ?? buildCompatibleNetworkError({ code: 'compatible_catalog_sync_failed', stage: 'response' })
          return await failAndRecord(envelope.code, envelope.stage, envelope.retryable, envelope.httpStatus ?? null, envelope)
        }
        let source
        try {
          source = parseCompatibleModelsResponse(bytes)
        } catch (error) {
          const code = error instanceof CompatibleCatalogSourceError ? error.code : 'compatible_catalog_unknown'
          return await failAndRecord(code, 'response', false, null)
        }
        const cancelledBeforeSequence = abortErrorFor(handle.abortReason())
        if (handle.signal.aborted || cancelledBeforeSequence) {
          const error = cancelledBeforeSequence ?? buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
          return await failAndRecord(error.code, error.stage, error.retryable, error.httpStatus ?? null, error)
        }
        const sequence = await input.db.call('compatibleCatalog.getNextSnapshotSequence', { providerInstanceId }) as number
        const cancelledBeforeCommit = abortErrorFor(handle.abortReason())
        if (handle.signal.aborted || cancelledBeforeCommit) {
          const error = cancelledBeforeCommit ?? buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
          return await failAndRecord(error.code, error.stage, error.retryable, error.httpStatus ?? null, error)
        }
        const snapshotId = catalogSnapshotIdSchema.parse(`ocp_catalog_snapshot_${randomSuffix()}`)
        const applied = await input.db.call('compatibleCatalog.applyRemoteSyncSuccess', {
          snapshot: {
            snapshotId,
            providerInstanceId,
            snapshotSequence: sequence,
            observedAtMs: startedAtMs,
            checksum: createHash('sha256').update(bytes).digest('hex'),
            metadata: { schemaVersion: 1, ...source.diagnostics },
          },
          models: source.models.map((model) => ({
            modelId: model.modelId,
            metadata: compatibleModelMetadataSchema.parse(model.metadata),
          })),
        }) as Readonly<{
          snapshot: Readonly<{ snapshotId: string }>
          syncState: CompatibleCatalogSyncState
          models: readonly CompatibleMergedModel[]
        }>
        lastState = applied.syncState
        return Object.freeze({
          ok: true,
          requestId: raw.requestId,
          providerInstanceId,
          snapshotId: applied.snapshot.snapshotId,
          status: source.models.length === 0 ? 'empty_success' : 'success',
          models: applied.models,
          syncState: lastState,
          sourceDiagnostics: source.diagnostics,
          transportDiagnostics: transportResult.diagnostics,
        })

        async function failAndRecord(
          diagnosticCode: string,
          stage: CompatibleNetworkErrorEnvelope['stage'],
          retryable: boolean,
          httpStatus: number | null,
          envelope = buildCompatibleNetworkError({ code: 'compatible_catalog_sync_failed', stage }),
        ): Promise<CompatibleCatalogSyncResult> {
          const failureCount = (lastState?.failureCount ?? 0) + 1
          const backoffUntilMs = retryable ? startedAtMs + backoffMs(failureCount) : null
          try {
            lastState = await input.db.call('compatibleCatalog.recordSyncFailure', {
              providerInstanceId,
              attemptedAtMs: startedAtMs,
              backoffUntilMs,
              diagnostics: compatibleCatalogSyncDiagnosticsSchema.parse({
                schemaVersion: 1,
                code: diagnosticCode.slice(0, 128).replace(/[^a-z0-9_.-]/giu, '-').toLowerCase(),
                messageKey: 'compatible.catalog.sync_failed',
                retryable,
                httpStatus,
              }),
            }) as CompatibleCatalogSyncState
          } catch {
            lastState = null
          }
          return Object.freeze({ ok: false, requestId: raw.requestId, providerInstanceId, error: envelope, syncState: lastState })
        }
      } catch {
        if (lastState?.status === 'syncing' && lastState.lastAttemptAtMs !== null) {
          try {
            lastState = await input.db.call('compatibleCatalog.recordSyncFailure', {
              providerInstanceId,
              attemptedAtMs: lastState.lastAttemptAtMs,
              backoffUntilMs: null,
              diagnostics: {
                schemaVersion: 1,
                code: 'compatible_catalog_internal',
                messageKey: 'compatible.catalog.sync_failed',
                retryable: false,
                httpStatus: null,
              },
            }) as CompatibleCatalogSyncState
          } catch {
            lastState = null
          }
        }
        return failed(raw.requestId, providerInstanceId, 'compatible_catalog_sync_failed', 'request', lastState)
      } finally {
        activeByProvider.delete(providerInstanceId)
        handle.finish()
      }
    },
    abortSync: ({ requestId, ownerWebContentsId }) => Object.freeze({
      aborted: input.requests.abortRequestForOwner(requestId, ownerWebContentsId, 'user_abort'),
    }),
    abortOwner: (ownerWebContentsId) => input.requests.abortOwner(ownerWebContentsId, 'window_destroyed'),
    abortAll: () => input.requests.abortAll('app_shutdown'),
  }
}

function failed(
  requestId: string,
  providerInstanceId: string,
  code: Parameters<typeof buildCompatibleNetworkError>[0]['code'],
  stage: Parameters<typeof buildCompatibleNetworkError>[0]['stage'],
  syncState: CompatibleCatalogSyncState | null,
): Extract<CompatibleCatalogSyncResult, { ok: false }> {
  return Object.freeze({
    ok: false,
    requestId,
    providerInstanceId,
    error: buildCompatibleNetworkError({ code, stage }),
    syncState,
  })
}

function backoffMs(failureCount: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * (2 ** Math.min(7, Math.max(0, failureCount - 1))))
}

function abortErrorFor(reason: CompatibleRequestAbortReason | null): CompatibleNetworkErrorEnvelope | null {
  if (reason === 'headers_timeout' || reason === 'idle_timeout' || reason === 'overall_timeout') {
    return buildCompatibleNetworkError({ code: 'compatible_timeout', stage: 'lifecycle' })
  }
  if (reason === 'window_destroyed') return buildCompatibleNetworkError({ code: 'compatible_window_destroyed', stage: 'lifecycle' })
  if (reason === 'user_abort' || reason === 'app_shutdown') return buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
  return null
}

function isNetworkEnvelope(value: unknown): value is CompatibleNetworkErrorEnvelope {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'stage' in value && 'safeMessage' in value)
}
