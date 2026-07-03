import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { mapCacheCorruptedToCode, mapDbUnavailableToCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import { isCatalogStatusStale } from '../../src/shared/modelCatalog/catalogSyncSettings'
import { readProviderCatalogSettings } from '../../src/shared/modelCatalog/providerCatalogSettings'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import { resolveCurrentOpenRouterCatalogScope } from './providerCatalogScopeResolver'

export type SyncStatusResult = Readonly<{
  providerKey: string
  syncState: string
  status: 'not_synced' | 'syncing' | 'synced' | 'failed'
  lastSyncAtMs: number
  modelCount: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  failureReasonCode: string | null
  isStale: boolean
  catalogRevision: string | null
}>

export type ScopedQueryInput = Readonly<{
  providerKey?: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  category?: string
  vendors?: string[]
  providers?: string[]
  modelIds?: string[]
  capabilities?: {
    reasoning?: boolean
    tools?: boolean
    structuredOutputs?: boolean
    vision?: boolean
    longContext?: boolean
  }
  contextLength?: { min?: number; max?: number }
  maxOutputTokens?: { min?: number; max?: number }
  modalities?: string[]
  inputModalities?: string[]
  outputModalities?: string[]
  supportedParameters?: string[]
  sortBy?: string
  sortOrder?: string
  limit?: number
  cursor?: unknown
}>

export type ScopedQueryResult = Readonly<{
  providerKey: string
  status: 'not_synced' | 'syncing' | 'synced' | 'failed'
  syncState: string
  failureReasonCode: string | null
  catalogRevision: string | null
  modelCount: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastSyncAtMs: number
  items: unknown[]
  nextCursor: unknown | null
}>

export type CatalogClearResult = Readonly<{
  ok: boolean
  providerKey: string
  deleted: Record<string, number>
  deletedScopeCount: number
  errorCode: string | null
  errorMessage: string | null
}>

export type ProviderCatalogQueryServiceInput = Readonly<{
  store: Store
  credentialStore: OpenRouterCatalogCredentialStoreReader
  dbWorkerManager: DbWorkerManager
  notifyRenderer?: (channel: string, payload: unknown) => void
}>

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null || value === '') return null
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)
  }
  if (value == null || value === '') return []
  try {
    const parsed = JSON.parse(String(value))
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function mapScopedQueryItem(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = parseJsonObject(row.pricingJson)
  const capabilities = parseJsonObject(row.capabilitiesJson)
  return {
    providerKey: row.providerKey,
    modelId: row.modelId,
    modelKey: row.modelKey,
    canonicalSlug: row.canonicalSlug ?? null,
    displayName: row.displayName,
    description: row.description ?? null,
    vendor: row.vendor ?? null,
    family: row.family ?? null,
    status: row.status ?? null,
    visibility: row.visibility ?? null,
    contextLength: row.contextLength ?? null,
    maxOutputTokens: row.maxOutputTokens ?? null,
    createdAtSec: row.createdAtSec ?? null,
    inputModalities: parseJsonStringArray(row.inputModalitiesJson),
    outputModalities: parseJsonStringArray(row.outputModalitiesJson),
    supportedParameters: parseJsonStringArray(row.supportedParametersJson),
    pricing: {
      prompt: typeof pricing?.prompt === 'string' ? pricing.prompt : null,
      completion: typeof pricing?.completion === 'string' ? pricing.completion : null,
      request: typeof pricing?.request === 'string' ? pricing.request : null,
      image: typeof pricing?.image === 'string' ? pricing.image : null,
      webSearch: typeof pricing?.web_search === 'string' ? pricing.web_search : typeof pricing?.webSearch === 'string' ? pricing.webSearch : null,
      internalReasoning: typeof pricing?.internal_reasoning === 'string' ? pricing.internal_reasoning : typeof pricing?.internalReasoning === 'string' ? pricing.internalReasoning : null,
      inputCacheRead: typeof pricing?.input_cache_read === 'string' ? pricing.input_cache_read : typeof pricing?.inputCacheRead === 'string' ? pricing.inputCacheRead : null,
      inputCacheWrite: typeof pricing?.input_cache_write === 'string' ? pricing.input_cache_write : typeof pricing?.inputCacheWrite === 'string' ? pricing.inputCacheWrite : null,
    },
    capabilities: {
      reasoning: capabilities?.reasoning === true,
      tools: capabilities?.tools === true,
      structuredOutputs: capabilities?.structuredOutputs === true,
      vision: capabilities?.vision === true,
      longContext: capabilities?.longContext === true,
    },
    firstSeenAtMs: row.firstSeenAtMs ?? null,
    lastSeenAtMs: row.lastSeenAtMs ?? null,
    syncedAtMs: row.syncedAtMs ?? null,
    raw: {
      rawJson: null,
      inputModalitiesJson: row.inputModalitiesJson ?? '[]',
      outputModalitiesJson: row.outputModalitiesJson ?? '[]',
      supportedParametersJson: row.supportedParametersJson ?? '[]',
      capabilitiesJson: row.capabilitiesJson ?? '{}',
      pricingJson: row.pricingJson ?? null,
    },
  }
}

export function catalogRevisionFromMeta(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null
  const checksum = String(meta.snapshotChecksum ?? '').trim()
  if (checksum) return checksum
  const activeSnapshotId = String(meta.activeSnapshotId ?? '').trim()
  const modelCount = Number(meta.modelCount ?? 0)
  const lastSyncAtMs = Number(meta.lastSyncAtMs ?? 0)
  if (!activeSnapshotId && (!Number.isFinite(lastSyncAtMs) || lastSyncAtMs <= 0)) return null
  return `${modelCount}:${Number.isFinite(lastSyncAtMs) ? lastSyncAtMs : 0}`
}

export function modelCountsFromMeta(
  meta: Record<string, unknown> | null | undefined,
  fallbackModelCount = 0,
): Readonly<{ modelCount: number; visibleModelCount?: number; hiddenModelCount?: number }> {
  const modelCount = Number(meta?.modelCount ?? fallbackModelCount)
  const rawVisible = Number(meta?.visibleModelCount)
  const rawHidden = Number(meta?.hiddenModelCount)
  const safeModelCount = Number.isFinite(modelCount) ? Math.max(0, modelCount) : 0
  return {
    modelCount: safeModelCount,
    ...(Number.isFinite(rawVisible) ? { visibleModelCount: Math.max(0, rawVisible) } : {}),
    ...(Number.isFinite(rawHidden) ? { hiddenModelCount: Math.max(0, rawHidden) } : {}),
  }
}

export function freshnessMsFromStore(store: Store): number {
  return readProviderCatalogSettings(store, 'openrouter').freshnessMs
}

export async function getProviderCatalogSyncStatus(
  input: ProviderCatalogQueryServiceInput,
  options?: unknown,
): Promise<SyncStatusResult> {
  const opts = (options ?? {}) as { providerKey?: string }
  const providerKey = opts.providerKey ?? 'openrouter'

  const scope = resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore)
  if (!scope) {
    const mapped = mapMissingApiKeyToCode()
    return {
      providerKey,
      syncState: 'error',
      status: 'failed',
      lastSyncAtMs: 0,
      modelCount: 0,
      lastErrorCode: mapped.code,
      lastErrorMessage: mapped.message,
      failureReasonCode: mapped.code,
      isStale: true,
      catalogRevision: null,
    }
  }

  try {
    const raw = await input.dbWorkerManager.call('modelCatalog.getScopedMeta', {
      providerKey,
      catalogScopeKey: scope.catalogScopeKey,
    })
    if (!raw || typeof raw !== 'object') {
      return {
        providerKey,
        syncState: 'idle',
        status: 'not_synced',
        lastSyncAtMs: 0,
        modelCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReasonCode: null,
        isStale: true,
        catalogRevision: null,
      }
    }
    const row = raw as Record<string, unknown>
    const syncState = String(row.syncState ?? 'idle')
    const freshnessMs = freshnessMsFromStore(input.store)
    const lastSyncAtMs = Number(row.lastSyncAtMs ?? 0)
    const counts = modelCountsFromMeta(row)
    const catalogRevision = catalogRevisionFromMeta(row)
    if (syncState === 'ok') {
      const validation = await input.dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
        providerKey,
        catalogScopeKey: scope.catalogScopeKey,
      }) as { ok?: boolean; code?: string; message?: string }
      if (validation?.ok !== true) {
        const mapped = mapCacheCorruptedToCode()
        return {
          providerKey,
          syncState: 'error',
          status: 'failed',
          lastSyncAtMs,
          ...counts,
          lastErrorCode: mapped.code,
          lastErrorMessage: mapped.message,
          failureReasonCode: mapped.code,
          isStale: true,
          catalogRevision,
        }
      }
    }
    if (syncState === 'error') {
      const code = row.lastErrorCode != null ? String(row.lastErrorCode) : 'unknown_error'
      return {
        providerKey,
        syncState: 'error',
        status: 'failed',
        lastSyncAtMs,
        ...counts,
        lastErrorCode: code,
        lastErrorMessage: row.lastErrorMessage != null ? String(row.lastErrorMessage) : null,
        failureReasonCode: code,
        isStale: true,
        catalogRevision,
      }
    }
    const status = syncState === 'ok' ? 'synced' : syncState === 'syncing' ? 'syncing' : 'not_synced'
    return {
      providerKey,
      syncState,
      status,
      lastSyncAtMs,
      ...counts,
      lastErrorCode: row.lastErrorCode != null ? String(row.lastErrorCode) : null,
      lastErrorMessage: row.lastErrorMessage != null ? String(row.lastErrorMessage) : null,
      failureReasonCode: null,
      isStale: isCatalogStatusStale({ status, lastSyncAtMs, freshnessMs }),
      catalogRevision,
    }
  } catch {
    const mapped = mapDbUnavailableToCode()
    return {
      providerKey,
      syncState: 'error',
      status: 'failed',
      lastSyncAtMs: 0,
      modelCount: 0,
      lastErrorCode: mapped.code,
      lastErrorMessage: mapped.message,
      failureReasonCode: mapped.code,
      isStale: true,
      catalogRevision: null,
    }
  }
}

export async function queryCurrentProviderCatalog(
  input: ProviderCatalogQueryServiceInput,
  options?: unknown,
): Promise<ScopedQueryResult> {
  const opts = (options ?? {}) as ScopedQueryInput
  const providerKey = typeof opts.providerKey === 'string' && opts.providerKey.trim()
    ? opts.providerKey.trim()
    : 'openrouter'
  const scope = resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore)
  if (!scope) {
    const mapped = mapMissingApiKeyToCode()
    return {
      providerKey,
      status: 'failed',
      syncState: 'error',
      failureReasonCode: mapped.code,
      catalogRevision: null,
      modelCount: 0,
      lastSyncAtMs: 0,
      items: [],
      nextCursor: null,
    }
  }

  try {
    const meta = await input.dbWorkerManager.call('modelCatalog.getScopedMeta', {
      providerKey,
      catalogScopeKey: scope.catalogScopeKey,
    }) as Record<string, unknown> | null
    if (!meta || typeof meta !== 'object') {
      return {
        providerKey,
        status: 'not_synced',
        syncState: 'idle',
        failureReasonCode: null,
        catalogRevision: null,
        modelCount: 0,
        lastSyncAtMs: 0,
        items: [],
        nextCursor: null,
      }
    }

    const syncState = String(meta.syncState ?? 'idle')
    const catalogRevision = catalogRevisionFromMeta(meta)
    const counts = modelCountsFromMeta(meta)
    const lastSyncAtMs = Number(meta.lastSyncAtMs ?? 0)
    if (syncState === 'error') {
      return {
        providerKey,
        status: 'failed',
        syncState: 'error',
        failureReasonCode: meta.lastErrorCode != null ? String(meta.lastErrorCode) : 'unknown_error',
        catalogRevision,
        ...counts,
        lastSyncAtMs,
        items: [],
        nextCursor: null,
      }
    }
    if (syncState === 'syncing') {
      return {
        providerKey,
        status: 'syncing',
        syncState: 'syncing',
        failureReasonCode: null,
        catalogRevision,
        ...counts,
        lastSyncAtMs,
        items: [],
        nextCursor: null,
      }
    }
    if (syncState !== 'ok' || !String(meta.activeSnapshotId ?? '').trim()) {
      return {
        providerKey,
        status: 'not_synced',
        syncState,
        failureReasonCode: null,
        catalogRevision,
        ...counts,
        lastSyncAtMs,
        items: [],
        nextCursor: null,
      }
    }

    const validation = await input.dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
      providerKey,
      catalogScopeKey: scope.catalogScopeKey,
    }) as { ok?: boolean }
    if (validation?.ok !== true) {
      const mapped = mapCacheCorruptedToCode()
      return {
        providerKey,
        status: 'failed',
        syncState: 'error',
        failureReasonCode: mapped.code,
        catalogRevision,
        ...counts,
        lastSyncAtMs,
        items: [],
        nextCursor: null,
      }
    }

    const raw = await input.dbWorkerManager.call('modelCatalog.queryScopedActive', {
      providerKey,
      catalogScopeKey: scope.catalogScopeKey,
      searchText: typeof opts.searchText === 'string' ? opts.searchText : undefined,
      includeDescriptionInSearch: opts.includeDescriptionInSearch === true,
      category: typeof opts.category === 'string' ? opts.category : undefined,
      vendors: Array.isArray(opts.vendors) ? opts.vendors.map((item) => String(item)) : undefined,
      providers: Array.isArray(opts.providers) ? opts.providers.map((item) => String(item)) : undefined,
      modelIds: Array.isArray(opts.modelIds) ? opts.modelIds.map((item) => String(item)) : undefined,
      capabilities: opts.capabilities && typeof opts.capabilities === 'object'
        ? {
            ...(typeof opts.capabilities.reasoning === 'boolean' ? { reasoning: opts.capabilities.reasoning } : {}),
            ...(typeof opts.capabilities.tools === 'boolean' ? { tools: opts.capabilities.tools } : {}),
            ...(typeof opts.capabilities.structuredOutputs === 'boolean' ? { structuredOutputs: opts.capabilities.structuredOutputs } : {}),
            ...(typeof opts.capabilities.vision === 'boolean' ? { vision: opts.capabilities.vision } : {}),
            ...(typeof opts.capabilities.longContext === 'boolean' ? { longContext: opts.capabilities.longContext } : {}),
          }
        : undefined,
      contextLength: opts.contextLength,
      maxOutputTokens: opts.maxOutputTokens,
      modalities: Array.isArray(opts.modalities) ? opts.modalities.map((item) => String(item)) : undefined,
      inputModalities: Array.isArray(opts.inputModalities) ? opts.inputModalities.map((item) => String(item)) : undefined,
      outputModalities: Array.isArray(opts.outputModalities) ? opts.outputModalities.map((item) => String(item)) : undefined,
      supportedParameters: Array.isArray(opts.supportedParameters) ? opts.supportedParameters.map((item) => String(item)) : undefined,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder,
      limit: opts.limit,
      cursor: opts.cursor ?? null,
    }) as { items?: unknown[]; nextCursor?: unknown | null }
    const rows = Array.isArray(raw?.items) ? raw.items : []
    return {
      providerKey,
      status: 'synced',
      syncState: 'ok',
      failureReasonCode: null,
      catalogRevision,
      ...counts,
      lastSyncAtMs,
      items: rows
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => mapScopedQueryItem(row)),
      nextCursor: raw?.nextCursor ?? null,
    }
  } catch {
    const mapped = mapDbUnavailableToCode()
    return {
      providerKey,
      status: 'failed',
      syncState: 'error',
      failureReasonCode: mapped.code,
      catalogRevision: null,
      modelCount: 0,
      lastSyncAtMs: 0,
      items: [],
      nextCursor: null,
    }
  }
}

export async function clearCurrentProviderCatalogCache(
  input: ProviderCatalogQueryServiceInput,
): Promise<CatalogClearResult> {
  const providerKey = 'openrouter'
  const scope = resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore)
  if (!scope) {
    const mapped = mapMissingApiKeyToCode()
    return {
      ok: false,
      providerKey,
      deleted: {},
      deletedScopeCount: 0,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    }
  }

  try {
    const result = await input.dbWorkerManager.call('modelCatalog.clearScopedCatalog', {
      providerKey,
      catalogScopeKey: scope.catalogScopeKey,
    }) as { deleted?: Record<string, number>; deletedScopeCount?: number } | null
    input.notifyRenderer?.('db:modelCatalogSynced', {
      routerSource: providerKey,
      modelCount: 0,
      lastSyncAtMs: 0,
    })
    return {
      ok: true,
      providerKey,
      deleted: result?.deleted && typeof result.deleted === 'object' ? result.deleted : {},
      deletedScopeCount: Number(result?.deletedScopeCount ?? 0),
      errorCode: null,
      errorMessage: null,
    }
  } catch {
    const mapped = mapDbUnavailableToCode()
    return {
      ok: false,
      providerKey,
      deleted: {},
      deletedScopeCount: 0,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    }
  }
}

export async function clearAllProviderCatalogCaches(
  input: ProviderCatalogQueryServiceInput,
  providerKey = 'openrouter',
): Promise<CatalogClearResult> {
  try {
    const result = await input.dbWorkerManager.call('modelCatalog.clearAllProviderScopedCatalog', {
      providerKey,
    }) as { deleted?: Record<string, number>; deletedScopeCount?: number } | null
    input.notifyRenderer?.('db:modelCatalogSynced', {
      routerSource: providerKey,
      modelCount: 0,
      lastSyncAtMs: 0,
    })
    return {
      ok: true,
      providerKey,
      deleted: result?.deleted && typeof result.deleted === 'object' ? result.deleted : {},
      deletedScopeCount: Number(result?.deletedScopeCount ?? 0),
      errorCode: null,
      errorMessage: null,
    }
  } catch {
    const mapped = mapDbUnavailableToCode()
    return {
      ok: false,
      providerKey,
      deleted: {},
      deletedScopeCount: 0,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    }
  }
}
