import type BetterSqlite3 from 'better-sqlite3'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import type { RegisterInvoke } from './types'
import { OPENROUTER_MODEL_CATEGORIES, type OpenRouterModelCategory } from '../../src/next/modelCatalog/openRouterCategoryCache'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/next/modelCatalog/providerCatalogAuthorityRegistryV2'
import {
  ModelCatalogV2Repo,
  type ModelCatalogScopeIdentityV2,
  type ModelCatalogStoredSnapshotV2,
} from '../../infra/db/repo/modelCatalogV2Repo'
import { CatalogScopeCoordinatorV2, type CatalogScopeStateV2 } from '../services/catalogScopeCoordinatorV2'
import {
  createProviderFailureV2,
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '../../src/shared/provider/providerFailureV2'
import {
  decodeCatalogListApplyModeV2,
  decodeCatalogRetentionV2,
} from '../../src/shared/modelCatalog/catalogPolicyV2'
import { listProviderCatalogSourceDescriptors } from '../../src/shared/modelCatalog/providerCatalogRegistry'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'

export const GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS = Object.freeze([
  'openai-responses-models:list-availability',
  'anthropic-models:list-availability',
  'google-ai-studio-models:list-availability',
  'deepseek-models:list-availability',
  'generation-v2:openrouter-models:list',
] as const)

export const GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS = Object.freeze([
  'generation-v2:model-catalog:sync',
  'generation-v2:model-catalog:status',
  'generation-v2:model-catalog:clear-current',
  'generation-v2:model-catalog:clear-all',
  'generation-v2:model-catalog:apply-pending',
  'generation-v2:model-catalog:discard-pending',
] as const)

const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000

type ProviderCatalogKey = ProviderCatalogKnownProviderKey
const PROVIDER_CATALOG_KEYS = new Set<ProviderCatalogKey>(
  listProviderCatalogSourceDescriptors().map((descriptor) => descriptor.providerKey),
)
type ProviderResult = Readonly<Record<string, unknown> & { providerFailure?: ProviderFailureV2 }>
type ProviderConfig = Readonly<{
  providerKey: ProviderCredentialKey
  sourceProviderKey: ProviderCatalogKey
  endpointId: string
  profileId: string
  operationContractId: string
  list: (credential: string, signal: AbortSignal, category?: OpenRouterModelCategory) => Promise<ProviderResult>
}>

function requestOptions(
  payload: unknown,
  allowProvider = false,
  allowApplyMode = false,
  allowSnapshotDigest = false,
): Readonly<{
  timeoutMs: number
  providerKey?: ProviderCatalogKey
  category?: OpenRouterModelCategory
  retentionMs?: number | 'never'
  applyMode?: 'automatic' | 'manual'
  snapshotDigest?: string
}> {
  if (payload === undefined || payload === null) return Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new Error('invalid_payload')
  }
  const record = payload as Record<string, unknown>
  const allowed = new Set([
    'timeoutMs',
    'category',
    ...(allowProvider ? ['providerKey', 'retentionMs'] : []),
    ...(allowApplyMode ? ['applyMode'] : []),
    ...(allowSnapshotDigest ? ['snapshotDigest'] : []),
  ])
  if (Reflect.ownKeys(record).some((key) => typeof key !== 'string' || !allowed.has(key))) throw new Error('invalid_payload')
  const timeoutValue = record.timeoutMs
  if (timeoutValue !== undefined && (typeof timeoutValue !== 'number' || !Number.isFinite(timeoutValue))) throw new Error('invalid_payload')
  const providerKey = record.providerKey
  if (providerKey !== undefined && (!allowProvider || !PROVIDER_CATALOG_KEYS.has(providerKey as ProviderCatalogKey))) throw new Error('invalid_payload')
  const category = record.category
  if (category !== undefined && !(OPENROUTER_MODEL_CATEGORIES as readonly unknown[]).includes(category)) throw new Error('invalid_payload')
  if (category !== undefined && providerKey !== undefined && providerKey !== 'openrouter') throw new Error('invalid_payload')
  const retentionMs = record.retentionMs
  if (retentionMs !== undefined) {
    try { decodeCatalogRetentionV2(retentionMs) } catch { throw new Error('invalid_payload') }
  }
  if (record.applyMode !== undefined && !allowApplyMode) {
    throw new Error('invalid_payload')
  }
  let applyMode: 'automatic' | 'manual' | undefined
  if (record.applyMode !== undefined) {
    try { applyMode = decodeCatalogListApplyModeV2(record.applyMode) } catch { throw new Error('invalid_payload') }
  }
  const snapshotDigest = record.snapshotDigest
  if (snapshotDigest !== undefined &&
      (!allowSnapshotDigest || typeof snapshotDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(snapshotDigest))) {
    throw new Error('invalid_payload')
  }
  return Object.freeze({
    timeoutMs: timeoutValue === undefined ? DEFAULT_TIMEOUT_MS : Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(timeoutValue))),
    ...(providerKey === undefined ? {} : { providerKey: providerKey as ProviderCatalogKey }),
    ...(category === undefined ? {} : { category: category as OpenRouterModelCategory }),
    ...(retentionMs === undefined ? {} : { retentionMs: decodeCatalogRetentionV2(retentionMs) }),
    ...(applyMode === undefined ? {} : { applyMode }),
    ...(snapshotDigest === undefined ? {} : { snapshotDigest }),
  })
}

function createProviderConfigs(fetchImpl: ProviderFetch): Readonly<Record<ProviderCatalogKey, ProviderConfig>> {
  return Object.freeze(Object.fromEntries(ProviderCatalogAuthorityRegistryV2.list().map((authority) => [
    authority.providerKey,
    (() => {
      const source = authority.source()
      return Object.freeze({
      providerKey: authority.credentialKey,
      sourceProviderKey: authority.providerKey,
      endpointId: source.descriptor.defaultBaseUrl,
      profileId: authority.endpointProfileId,
      operationContractId: authority.modelsContractId,
      list: async (credential: string, signal: AbortSignal, category?: OpenRouterModelCategory): Promise<ProviderResult> => {
        const snapshot = await source.fetchSnapshot({
          providerKey: authority.providerKey,
          baseUrl: source.descriptor.defaultBaseUrl,
          apiKey: credential,
          fetchImpl: fetchImpl as typeof fetch,
          signal,
          preferUserScopedModels: true,
          ...(category ? { category } : {}),
        })
        return Object.freeze({
          ok: true,
          observedAtMs: snapshot.fetchedAtMs,
          items: Object.freeze(snapshot.models.map((model) => Object.freeze({ ...model }))),
        })
      },
      } satisfies ProviderConfig)
    })(),
  ])) as Record<ProviderCatalogKey, ProviderConfig>)
}

function scopeFor(config: ProviderConfig, credentialScopeId: string, category?: OpenRouterModelCategory): ModelCatalogScopeIdentityV2 {
  return Object.freeze({ providerKey: config.sourceProviderKey, credentialScopeId,
    endpointProfileId: config.profileId, operationContractId: config.operationContractId,
    category: category ?? '' })
}

function snapshotResult(state: CatalogScopeStateV2, config?: ProviderConfig, selected?: ModelCatalogStoredSnapshotV2) {
  const { status, pending } = state
  const active = selected && status ? Object.freeze({
    status: Object.freeze({
      ...status,
      activeSnapshotDigest: selected.snapshotDigest,
      modelCount: selected.modelCount,
      visibleModelCount: selected.visibleModelCount,
      hiddenModelCount: selected.hiddenModelCount,
    }),
    observedAtMs: selected.observedAtMs,
    items: selected.items,
  }) : state.active
  const providerFailure = status?.lastFailure ?? null
  const errorMessage = providerFailure ? providerFailurePrimaryMessageV2(providerFailure) : null
  const providerFields = config ? { providerKey: config.sourceProviderKey, endpointId: config.endpointId,
    profileId: config.profileId } : {}
  if (!active) return Object.freeze({ ok: true, ...providerFields, items: Object.freeze([]), models: Object.freeze([]), status: status?.syncState === 'syncing' ? 'syncing' :
    status?.syncState === 'error' ? 'failed' : 'not_synced', responseDigest: null, observedAtMs: null,
    modelCount: 0, visibleModelCount: 0, hiddenModelCount: 0, errorCode: status?.errorCode ?? null,
    errorMessage, providerFailure, scopeId: status?.scopeId ?? null,
    authorityRevision: status?.authorityRevision ?? 0,
    pendingSnapshotDigest: pending?.snapshotDigest ?? status?.pendingSnapshotDigest ?? null })
  return Object.freeze({ ok: true, ...providerFields, items: active.items, models: active.items,
    status: status?.syncState === 'syncing' ? 'syncing' : status?.syncState === 'error' ? 'failed' : 'synced',
    responseDigest: active.status.activeSnapshotDigest, observedAtMs: active.observedAtMs,
    modelCount: active.status.modelCount, visibleModelCount: active.status.visibleModelCount,
    hiddenModelCount: active.status.hiddenModelCount, errorCode: active.status.errorCode,
    errorMessage, providerFailure, scopeId: status?.scopeId ?? null,
    authorityRevision: status?.authorityRevision ?? 0,
    pendingSnapshotDigest: pending?.snapshotDigest ?? status?.pendingSnapshotDigest ?? null })
}

export function registerGenerationV2ModelAvailabilityIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: Epoch2RuntimeCredentialService
  db: BetterSqlite3.Database
  fetchImpl?: ProviderFetch
}>): readonly string[] {
  const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
  const providerConfigs = createProviderConfigs(fetchImpl)
  const repo = new ModelCatalogV2Repo(input.db)
  const coordinator = new CatalogScopeCoordinatorV2(repo)

  type CredentialStatus = Awaited<ReturnType<Epoch2RuntimeCredentialService['getStatus']>>
  type ResolvedScope =
    | Readonly<{ ok: true; status: CredentialStatus; scope: ModelCatalogScopeIdentityV2 }>
    | Readonly<{ ok: false; error: 'credential_missing' }>
    | Readonly<{ ok: false; failure: ProviderFailureV2 }>

  const resolveScope = async (config: ProviderConfig, category?: OpenRouterModelCategory): Promise<ResolvedScope> => {
    try {
      const status = await input.credentialService.getStatus(config.providerKey)
      if (!status.configured || !status.credentialScopeId) return { ok: false, error: 'credential_missing' }
      return { ok: true, status, scope: scopeFor(config, status.credentialScopeId, category) }
    } catch (error) {
      return { ok: false, failure: providerFailureFromUnknownV2(error, {
        origin: 'secure_storage',
        phase: 'request_open',
        providerId: config.sourceProviderKey,
        contractId: config.operationContractId,
        operationId: `catalog-credential-status:${config.sourceProviderKey}`,
        requestSequence: 1,
        starverseDiagnosticCode: 'PROVIDER_CREDENTIAL_STATUS_FAILED',
      }) }
    }
  }

  const resolvedScopeFailure = (resolved: Extract<ResolvedScope, { ok: false }>) => {
    if ('failure' in resolved) return Object.freeze({
      ok: false,
      code: resolved.failure.starverseDiagnosticCode,
      message: providerFailurePrimaryMessageV2(resolved.failure),
      providerFailure: resolved.failure,
    })
    return Object.freeze({ ok: false, code: resolved.error })
  }

  const databaseFailureResult = (
    config: ProviderConfig,
    operationId: string,
    diagnosticCode: string,
    error: unknown,
    scope?: ModelCatalogScopeIdentityV2,
  ) => {
    const providerFailure = providerFailureFromUnknownV2(error, {
      origin: 'database',
      phase: 'terminal_persistence',
      providerId: config.sourceProviderKey,
      contractId: config.operationContractId,
      operationId,
      requestSequence: 1,
      starverseDiagnosticCode: diagnosticCode,
    })
    let active: ReturnType<typeof snapshotResult> | undefined
    if (scope) {
      try { active = snapshotResult(coordinator.read(scope), config) } catch { /* preserve the original database failure */ }
    }
    return Object.freeze({
      ok: false,
      code: providerFailure.starverseDiagnosticCode,
      message: providerFailurePrimaryMessageV2(providerFailure),
      providerFailure,
      ...(active ? { active } : {}),
    })
  }

  const registerList = (channel: typeof GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[number], config: ProviderConfig) =>
    input.registerInvoke(channel, async (_event: unknown, payload: unknown) => {
      let request: ReturnType<typeof requestOptions>
      try { request = requestOptions(payload, false, false, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
      if (request.category && config.sourceProviderKey !== 'openrouter') return Object.freeze({ ok: false, code: 'invalid_payload' })
      const resolved = await resolveScope(config, request.category)
      if (!resolved.ok) return resolvedScopeFailure(resolved)
      try {
        const state = coordinator.read(resolved.scope)
        if (!request.snapshotDigest) return snapshotResult(state, config)
        const selected = coordinator.readSnapshot(resolved.scope, request.snapshotDigest)
        if (selected) return snapshotResult(state, config, selected)
        const providerFailure = createProviderFailureV2({
          context: {
            origin: 'database',
            phase: 'response_body',
            providerId: config.sourceProviderKey,
            contractId: config.operationContractId,
            operationId: `catalog-read-snapshot:${request.snapshotDigest}`,
            requestSequence: 1,
            starverseDiagnosticCode: 'MODEL_CATALOG_SNAPSHOT_NOT_FOUND',
          },
          body: { requestedSnapshotDigest: request.snapshotDigest },
        })
        return Object.freeze({
          ok: false,
          code: providerFailure.starverseDiagnosticCode,
          message: providerFailurePrimaryMessageV2(providerFailure),
          providerFailure,
        })
      } catch (error) {
        const providerFailure = providerFailureFromUnknownV2(error, {
          origin: 'database',
          phase: 'response_body',
          providerId: config.sourceProviderKey,
          contractId: config.operationContractId,
          operationId: 'catalog-read-snapshot',
          requestSequence: 1,
          starverseDiagnosticCode: 'MODEL_CATALOG_READ_FAILED',
        })
        return Object.freeze({
          ok: false,
          code: providerFailure.starverseDiagnosticCode,
          message: providerFailurePrimaryMessageV2(providerFailure),
          providerFailure,
        })
      }
    })

  const orderedConfigs = [providerConfigs.openai_responses, providerConfigs.anthropic_messages,
    providerConfigs.google_ai_studio, providerConfigs.deepseek, providerConfigs.openrouter] as const
  GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS.forEach((channel, index) => registerList(channel, orderedConfigs[index]!))

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if (!resolved.ok) return resolvedScopeFailure(resolved)
    const operationId = `catalog:${config.sourceProviderKey}:${Date.now()}`
    const result = await coordinator.sync({
      scope: resolved.scope,
      applyMode: request.applyMode ?? 'automatic',
      retentionMs: request.retentionMs ?? 'never',
      timeoutMs: request.timeoutMs,
      failureContext: {
        origin: 'provider_runtime', phase: 'response_body', providerId: config.sourceProviderKey,
        contractId: config.operationContractId, operationId, requestSequence: 1,
      },
      execute: async (signal) => {
        const providerResult = await input.credentialService.withCredential({ providerKey: config.providerKey,
        expectedRevision: resolved.status.revision, expectedCredentialScopeId: resolved.status.credentialScopeId!,
        consume: (lease) => config.list(lease.credential, signal, request.category) }) as ProviderResult
        if (providerResult.ok !== true) {
          const providerFailure = providerResult.providerFailure ?? providerFailureFromUnknownV2(providerResult, {
          origin: 'provider_runtime', phase: 'response_body', providerId: config.sourceProviderKey,
          contractId: config.operationContractId, operationId, requestSequence: 1,
        })
          return Object.freeze({ ok: false as const, providerFailure })
        }
        const items = Array.isArray(providerResult.items) ? providerResult.items
          : Array.isArray(providerResult.models) ? providerResult.models : null
        if (!items || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
          return Object.freeze({ ok: false as const, providerFailure: createProviderFailureV2({
          context: { origin: 'response_decoder', phase: 'stream_decode', providerId: config.sourceProviderKey,
            contractId: config.operationContractId, operationId, requestSequence: 1 },
          body: { diagnostic: 'catalog response shape invalid' },
          }) })
        }
        return Object.freeze({
          ok: true as const,
          items: items as readonly Readonly<Record<string, unknown>>[],
          responseDigest: typeof providerResult.responseDigest === 'string' ? providerResult.responseDigest : undefined,
          observedAtMs: typeof providerResult.observedAtMs === 'number' ? providerResult.observedAtMs : undefined,
        })
      },
    })
    if (!result.ok) {
      return Object.freeze({
        ok: false,
        code: result.providerFailure.starverseDiagnosticCode,
        message: providerFailurePrimaryMessageV2(result.providerFailure),
        providerFailure: result.providerFailure,
        persistenceFailure: result.persistenceFailure ?? null,
        active: snapshotResult(result.state, config),
      })
    }
    const projected = snapshotResult(result.state, config)
    return result.publication === 'pending'
      ? Object.freeze({ ...projected, status: 'pending' })
      : projected
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[1], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if (!resolved.ok) return resolvedScopeFailure(resolved)
    try {
      return snapshotResult(coordinator.read(resolved.scope), config)
    } catch (error) {
      return databaseFailureResult(config, 'catalog-status', 'MODEL_CATALOG_STATUS_READ_FAILED', error, resolved.scope)
    }
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[2], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if (!resolved.ok) return resolvedScopeFailure(resolved)
    try {
      return Object.freeze({ ok: true, deletedScopes: repo.clearCurrentCredentialScopes(resolved.scope) })
    } catch (error) {
      return databaseFailureResult(config, 'catalog-clear-current', 'MODEL_CATALOG_CLEAR_CURRENT_FAILED', error, resolved.scope)
    }
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[3], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config || request.category) return Object.freeze({ ok: false, code: 'invalid_payload' })
    try {
      return Object.freeze({ ok: true, deletedScopes: repo.clearAllScopes(config.sourceProviderKey) })
    } catch (error) {
      return databaseFailureResult(config, 'catalog-clear-all', 'MODEL_CATALOG_CLEAR_ALL_FAILED', error)
    }
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[4], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true, false, true) } catch {
      return Object.freeze({ ok: false, code: 'invalid_payload' })
    }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config || !request.snapshotDigest) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if (!resolved.ok) return resolvedScopeFailure(resolved)
    try {
      return snapshotResult(coordinator.applyPending({
        scope: resolved.scope,
        expectedSnapshotDigest: request.snapshotDigest,
      }), config)
    } catch (error) {
      return databaseFailureResult(config, `catalog-apply:${request.snapshotDigest}`,
        'MODEL_CATALOG_PENDING_APPLY_FAILED', error, resolved.scope)
    }
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[5], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true, false, true) } catch {
      return Object.freeze({ ok: false, code: 'invalid_payload' })
    }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config || !request.snapshotDigest) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if (!resolved.ok) return resolvedScopeFailure(resolved)
    try {
      return snapshotResult(coordinator.discardPending({
        scope: resolved.scope,
        expectedSnapshotDigest: request.snapshotDigest,
      }), config)
    } catch (error) {
      return databaseFailureResult(config, `catalog-discard:${request.snapshotDigest}`,
        'MODEL_CATALOG_PENDING_DISCARD_FAILED', error, resolved.scope)
    }
  })

  return Object.freeze([...GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS, ...GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS])
}
