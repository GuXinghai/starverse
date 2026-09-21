import type BetterSqlite3 from 'better-sqlite3'
import {
  OpenAICompatibleV2Repo,
  type OpenAICompatibleEndpointRevisionV2,
} from '../../infra/db/repo/openAICompatibleV2Repo'
import { parseCompatibleModelsResponse } from '../../src/shared/modelCatalog/providers/openai-chat-compatible/compatibleCatalogSource'
import type { CompatibleCatalogSyncState } from '../../src/shared/provider/openai-chat-compatible'
import { readOpenAIChatCompatibleModelsEndpointV2 } from '../../infra/db/services/openAICompatibleModelsEndpointV2'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { createOpenAICompatibleHeadersV2 } from './openAICompatibleNetworkV2'

type CredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>
const MAX_MODELS_BYTES = 8 * 1024 * 1024

export function createOpenAICompatibleCatalogV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: CredentialService
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  proxyMode: () => 'environment' | 'manual' | 'direct' | 'system'
  nowMs?: () => number
}>) {
  const repo = new OpenAICompatibleV2Repo(input.db, input.nowMs ?? Date.now)
  const states = new Map<string, CompatibleCatalogSyncState>()
  const controllers = new Map<string, AbortController>()
  const nowMs = input.nowMs ?? Date.now
  const state = (providerInstanceId: string): CompatibleCatalogSyncState | null => states.get(providerInstanceId) ?? null
  async function credentialBinding(providerInstanceId: string, endpoint: OpenAICompatibleEndpointRevisionV2) {
    const auth = endpoint.auth as { mode?: unknown; credentialVersionRef?: unknown }
    if (auth.mode === 'none') return Object.freeze({ credentialScopeId: 'compatible-credential-none', credentialRevision: 0 })
    if ((auth.mode !== 'bearer' && auth.mode !== 'basic' && auth.mode !== 'custom_headers') ||
        typeof auth.credentialVersionRef !== 'string') {
      throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    }
    const status = await input.credentialService.getStatus(providerInstanceId, auth.credentialVersionRef)
    if (!status.configured || !status.credentialScopeId || status.revision < 1) {
      throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
    }
    return Object.freeze({ credentialScopeId: status.credentialScopeId, credentialRevision: status.revision })
  }
  async function fetchModels(providerInstanceId: string, signal?: AbortSignal) {
    const provider = repo.get(providerInstanceId); const endpoint = provider.endpointRevisions[0]
    if (provider.status !== 'active' || !endpoint) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_PROVIDER_UNAVAILABLE')
    const binding = await credentialBinding(providerInstanceId, endpoint)
    const headers = await createOpenAICompatibleHeadersV2({ credentialService: input.credentialService,
      providerInstanceId, endpoint, expectedRevision: binding.credentialRevision,
      expectedCredentialScopeId: binding.credentialRevision === 0 ? undefined : binding.credentialScopeId as never,
      accept: 'application/json' })
    const response = await input.fetchImpl(readOpenAIChatCompatibleModelsEndpointV2(endpoint), {
      method: 'GET', redirect: 'error', signal, headers,
    })
    if (!response.ok) { try { await response.body?.cancel() } catch {}; throw new Error(`compatible_catalog_http_${response.status}`) }
    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_MODELS_BYTES) throw new Error('compatible_catalog_models_overflow')
    const bytes = new Uint8Array(await response.arrayBuffer())
    try {
      if (bytes.byteLength > MAX_MODELS_BYTES) throw new Error('compatible_catalog_models_overflow')
      return Object.freeze({ source: parseCompatibleModelsResponse(bytes), httpStatus: response.status,
        endpoint, binding })
    } finally { bytes.fill(0) }
  }
  async function sync(providerInstanceId: string, requestId: string) {
    if (controllers.has(requestId)) throw new Error('compatible_request_capacity')
    const controller = new AbortController(); controllers.set(requestId, controller); const attemptAt = nowMs()
    states.set(providerInstanceId, Object.freeze({ providerInstanceId: providerInstanceId as CompatibleCatalogSyncState['providerInstanceId'],
      status: 'syncing', lastAttemptAtMs: attemptAt, lastSuccessAtMs: state(providerInstanceId)?.lastSuccessAtMs ?? null,
      lastSuccessSnapshotId: null, failureCount: state(providerInstanceId)?.failureCount ?? 0, backoffUntilMs: null,
      diagnostics: null, updatedAtMs: attemptAt }))
    try {
      const fetched = await fetchModels(providerInstanceId, controller.signal); const source = fetched.source
      const currentProvider = repo.get(providerInstanceId); const currentEndpoint = currentProvider.endpointRevisions[0]
      if (currentProvider.status !== 'active' || !currentEndpoint ||
          currentEndpoint.endpointRevisionId !== fetched.endpoint.endpointRevisionId ||
          currentEndpoint.endpointDigest !== fetched.endpoint.endpointDigest) {
        throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT')
      }
      const currentBinding = await credentialBinding(providerInstanceId, currentEndpoint)
      if (currentBinding.credentialScopeId !== fetched.binding.credentialScopeId ||
          currentBinding.credentialRevision !== fetched.binding.credentialRevision) {
        throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      }
      const models = repo.replaceRemoteModels({ providerInstanceId,
        endpointRevisionId: currentEndpoint.endpointRevisionId, endpointDigest: currentEndpoint.endpointDigest,
        credentialScopeId: currentBinding.credentialScopeId, credentialRevision: currentBinding.credentialRevision,
        models: source.models }); const at = nowMs()
      const next = Object.freeze({ providerInstanceId: providerInstanceId as CompatibleCatalogSyncState['providerInstanceId'],
        status: models.length === 0 ? 'empty_success' as const : 'success' as const, lastAttemptAtMs: attemptAt,
        lastSuccessAtMs: at, lastSuccessSnapshotId: null, failureCount: 0, backoffUntilMs: null,
        diagnostics: null, updatedAtMs: at })
      states.set(providerInstanceId, next)
      return Object.freeze({ ok: true as const, requestId, providerInstanceId, status: next.status, models,
        syncState: next, sourceDiagnostics: source.diagnostics })
    } catch (error) {
      const at = nowMs(); const previous = state(providerInstanceId); const code = controller.signal.aborted ? 'compatible_aborted'
        : error instanceof Error ? error.message : 'compatible_catalog_sync_failed'
      const next = Object.freeze({ providerInstanceId: providerInstanceId as CompatibleCatalogSyncState['providerInstanceId'],
        status: 'failed' as const, lastAttemptAtMs: attemptAt, lastSuccessAtMs: previous?.lastSuccessAtMs ?? null,
        lastSuccessSnapshotId: null, failureCount: (previous?.failureCount ?? 0) + 1, backoffUntilMs: null,
        diagnostics: Object.freeze({ schemaVersion: 1 as const, code: 'compatible_catalog_sync_failed',
          messageKey: 'compatible_catalog_sync_failed', retryable: false, httpStatus: null }), updatedAtMs: at })
      states.set(providerInstanceId, next)
      throw new Error(code)
    } finally { controllers.delete(requestId) }
  }
  return Object.freeze({
    query: (providerInstanceId: string, includeStale = true) => Object.freeze({ provider: repo.get(providerInstanceId),
      syncState: state(providerInstanceId), items: repo.listMergedModels(providerInstanceId, includeStale) }),
    sync,
    abort: (requestId: string) => { const controller = controllers.get(requestId); if (!controller) return false; controller.abort('user_cancelled'); return true },
    getStatus: state,
    upsertManual: (providerInstanceId: string, modelId: string, metadata: unknown) => repo.upsertManualModel(providerInstanceId, modelId, metadata),
    deleteManual: (providerInstanceId: string, modelId: string) => repo.deleteManualModel(providerInstanceId, modelId),
    testConnection: async (providerInstanceId: string, requestId: string, signal?: AbortSignal) => {
      const fetched = await fetchModels(providerInstanceId, signal)
      const endpoint = repo.get(providerInstanceId).endpointRevisions[0]!
      return Object.freeze({ ok: true as const, requestId, httpStatus: fetched.httpStatus, diagnostics: Object.freeze({
        securityPolicy: endpoint.securityPolicy, proxyRoute: input.proxyMode(), transportKind: 'electron_session_fetch' as const,
        transportCapability: 'pre_request_audit_only' as const, proxyBypassed: false, redirectCount: 0,
        insecureHttp: endpoint.baseUrl.startsWith('http:'),
      }) })
    },
  })
}
