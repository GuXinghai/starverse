import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { resolveCurrentOpenRouterCatalogScope, runCatalogSyncAtStartup } from '../jobs/catalogSyncStartup'
import { mapCacheCorruptedToCode, mapDbUnavailableToCode, mapErrorToSyncCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import type { RegisterInvoke } from './types'

export const MODEL_CATALOG_SYNC_IPC_CHANNELS = [
  'modelCatalog.syncNow',
  'modelCatalog.getSyncStatus',
  'modelCatalog.queryScopedCurrent',
] as const

type SyncNowInput = Readonly<{
  providerKey?: string
  force?: boolean
  reason?: string
}>

type SyncStatusResult = Readonly<{
  providerKey: string
  syncState: string
  status: 'not_synced' | 'syncing' | 'synced' | 'failed'
  lastSyncAtMs: number
  modelCount: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  failureReasonCode: string | null
}>

type SyncNowResult = Readonly<{
  ok: boolean
  syncAttempted: boolean
  syncSucceeded: boolean
  providerKey: string
  modelCount: number
  lastSyncAtMs: number
  errorCode: string | null
  errorMessage: string | null
  failureReasonCode: string | null
}>

type ScopedQueryInput = Readonly<{
  providerKey?: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  vendors?: string[]
  providers?: string[]
  modelIds?: string[]
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

type ScopedQueryResult = Readonly<{
  providerKey: string
  status: 'not_synced' | 'syncing' | 'synced' | 'failed'
  syncState: string
  failureReasonCode: string | null
  items: unknown[]
  nextCursor: unknown | null
}>

const syncPromisesByScope = new Map<string, Promise<SyncNowResult>>()

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null || value === '') return null
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
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
    contextLength: row.contextLength ?? null,
    maxOutputTokens: row.maxOutputTokens ?? null,
    createdAtSec: row.createdAtSec ?? null,
    pricing: {
      prompt: typeof pricing?.prompt === 'string' ? pricing.prompt : null,
      completion: typeof pricing?.completion === 'string' ? pricing.completion : null,
      request: typeof pricing?.request === 'string' ? pricing.request : null,
      image: typeof pricing?.image === 'string' ? pricing.image : null,
    },
    capabilities: {
      reasoning: capabilities?.reasoning === true,
      tools: capabilities?.tools === true,
      structuredOutputs: capabilities?.structuredOutputs === true,
      vision: capabilities?.vision === true,
      longContext: capabilities?.longContext === true,
    },
  }
}

export function registerModelCatalogSyncIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  dbWorkerManager: DbWorkerManager
  notifyRenderer: (channel: string, payload: unknown) => void
}>): string[] {
  const { registerInvoke, store, dbWorkerManager, notifyRenderer } = input

  registerInvoke('modelCatalog.syncNow', async (_event: unknown, options?: unknown): Promise<SyncNowResult> => {
    const opts = (options ?? {}) as SyncNowInput
    const providerKey = opts.providerKey ?? 'openrouter'
    const force = opts.force === true
    const scope = resolveCurrentOpenRouterCatalogScope(store)
    if (!scope) {
      const mapped = mapMissingApiKeyToCode()
      return {
        ok: false,
        syncAttempted: false,
        syncSucceeded: false,
        providerKey,
        modelCount: 0,
        lastSyncAtMs: 0,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        failureReasonCode: mapped.code,
      }
    }
    const lockKey = `${providerKey}:${scope.catalogScopeKey}`
    const existingPromise = syncPromisesByScope.get(lockKey)
    if (existingPromise) return existingPromise

    const doSync = async (): Promise<SyncNowResult> => {
      try {
        const result = await runCatalogSyncAtStartup({
          store,
          dbWorkerManager,
          force,
        })

        if (result.syncSucceeded && result.syncAttempted && result.syncSnapshotId) {
          notifyRenderer('db:modelCatalogSynced', {
            routerSource: providerKey,
            snapshotId: result.syncSnapshotId,
            modelCount: result.modelCountAfter,
          })
        }

        const isCacheFresh = !result.syncAttempted && !result.syncSucceeded && result.reason === 'cache_fresh'

        if (isCacheFresh) {
          return {
            ok: true,
            syncAttempted: false,
            syncSucceeded: true,
            providerKey,
            modelCount: result.modelCountAfter,
            lastSyncAtMs: result.lastSyncAtMs,
            errorCode: null,
            errorMessage: null,
            failureReasonCode: null,
          }
        }

        let errorCode: string | null = null
        let errorMessage: string | null = null
        if (!result.syncSucceeded && result.syncAttempted) {
          if (result.reason.includes('missing_api_key')) {
            const mapped = mapMissingApiKeyToCode()
            errorCode = mapped.code
            errorMessage = mapped.message
          } else if (result.failureMessage) {
            const mapped = mapErrorToSyncCode(new Error(result.failureMessage))
            errorCode = mapped.code
            errorMessage = mapped.code === 'unknown_error' ? '未知错误' : mapped.message
          }
        }

        return {
          ok: result.syncSucceeded,
          syncAttempted: result.syncAttempted,
          syncSucceeded: result.syncSucceeded,
          providerKey,
          modelCount: result.modelCountAfter,
          lastSyncAtMs: result.lastSyncAtMs,
          errorCode,
          errorMessage,
          failureReasonCode: errorCode,
        }
      } catch (error) {
        const mapped = mapErrorToSyncCode(error)
        const safeErrorMessage = mapped.code === 'unknown_error' ? '未知错误' : mapped.message
        console.warn('[modelCatalog.syncNow] sync exception', {
          stage: 'syncNow_handler',
          providerKey,
          force,
          errorName: error instanceof Error ? error.name : typeof error,
          errorCode: (error as any)?.code ?? null,
          errorClass: error?.constructor?.name ?? null,
          normalizedReasonCode: mapped.code,
        })
        return {
          ok: false,
          syncAttempted: true,
          syncSucceeded: false,
          providerKey,
          modelCount: 0,
          lastSyncAtMs: Date.now(),
          errorCode: mapped.code,
          errorMessage: safeErrorMessage,
          failureReasonCode: mapped.code,
        }
      }
    }

    const promise = doSync()
    syncPromisesByScope.set(lockKey, promise)
    try {
      return await promise
    } finally {
      syncPromisesByScope.delete(lockKey)
    }
  })

  registerInvoke('modelCatalog.getSyncStatus', async (_event: unknown, options?: unknown): Promise<SyncStatusResult> => {
    const opts = (options ?? {}) as { providerKey?: string }
    const providerKey = opts.providerKey ?? 'openrouter'

    const scope = resolveCurrentOpenRouterCatalogScope(store)
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
      }
    }

    try {
      const raw = await dbWorkerManager.call('modelCatalog.getScopedMeta', {
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
        }
      }
      const row = raw as Record<string, unknown>
      const syncState = String(row.syncState ?? 'idle')
      if (syncState === 'ok') {
        const validation = await dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
          providerKey,
          catalogScopeKey: scope.catalogScopeKey,
        }) as { ok?: boolean; code?: string; message?: string }
        if (validation?.ok !== true) {
          const mapped = mapCacheCorruptedToCode()
          return {
            providerKey,
            syncState: 'error',
            status: 'failed',
            lastSyncAtMs: Number(row.lastSyncAtMs ?? 0),
            modelCount: Number(row.modelCount ?? 0),
            lastErrorCode: mapped.code,
            lastErrorMessage: mapped.message,
            failureReasonCode: mapped.code,
          }
        }
      }
      if (syncState === 'error') {
        const code = row.lastErrorCode != null ? String(row.lastErrorCode) : 'unknown_error'
        return {
          providerKey,
          syncState: 'error',
          status: 'failed',
          lastSyncAtMs: Number(row.lastSyncAtMs ?? 0),
          modelCount: Number(row.modelCount ?? 0),
          lastErrorCode: code,
          lastErrorMessage: row.lastErrorMessage != null ? String(row.lastErrorMessage) : null,
          failureReasonCode: code,
        }
      }
      return {
        providerKey,
        syncState,
        status: syncState === 'ok' ? 'synced' : syncState === 'syncing' ? 'syncing' : 'not_synced',
        lastSyncAtMs: Number(row.lastSyncAtMs ?? 0),
        modelCount: Number(row.modelCount ?? 0),
        lastErrorCode: row.lastErrorCode != null ? String(row.lastErrorCode) : null,
        lastErrorMessage: row.lastErrorMessage != null ? String(row.lastErrorMessage) : null,
        failureReasonCode: null,
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
      }
    }
  })

  registerInvoke('modelCatalog.queryScopedCurrent', async (_event: unknown, options?: unknown): Promise<ScopedQueryResult> => {
    const opts = (options ?? {}) as ScopedQueryInput
    const providerKey = typeof opts.providerKey === 'string' && opts.providerKey.trim()
      ? opts.providerKey.trim()
      : 'openrouter'
    const scope = resolveCurrentOpenRouterCatalogScope(store)
    if (!scope) {
      const mapped = mapMissingApiKeyToCode()
      return {
        providerKey,
        status: 'failed',
        syncState: 'error',
        failureReasonCode: mapped.code,
        items: [],
        nextCursor: null,
      }
    }

    try {
      const meta = await dbWorkerManager.call('modelCatalog.getScopedMeta', {
        providerKey,
        catalogScopeKey: scope.catalogScopeKey,
      }) as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') {
        return {
          providerKey,
          status: 'not_synced',
          syncState: 'idle',
          failureReasonCode: null,
          items: [],
          nextCursor: null,
        }
      }

      const syncState = String(meta.syncState ?? 'idle')
      if (syncState === 'error') {
        return {
          providerKey,
          status: 'failed',
          syncState: 'error',
          failureReasonCode: meta.lastErrorCode != null ? String(meta.lastErrorCode) : 'unknown_error',
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
          items: [],
          nextCursor: null,
        }
      }

      const validation = await dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
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
          items: [],
          nextCursor: null,
        }
      }

      const raw = await dbWorkerManager.call('modelCatalog.queryScopedActive', {
        providerKey,
        catalogScopeKey: scope.catalogScopeKey,
        searchText: typeof opts.searchText === 'string' ? opts.searchText : undefined,
        includeDescriptionInSearch: opts.includeDescriptionInSearch === true,
        vendors: Array.isArray(opts.vendors) ? opts.vendors.map((item) => String(item)) : undefined,
        providers: Array.isArray(opts.providers) ? opts.providers.map((item) => String(item)) : undefined,
        modelIds: Array.isArray(opts.modelIds) ? opts.modelIds.map((item) => String(item)) : undefined,
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
        items: [],
        nextCursor: null,
      }
    }
  })

  return [...MODEL_CATALOG_SYNC_IPC_CHANNELS]
}
