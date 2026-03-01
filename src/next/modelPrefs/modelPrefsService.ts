const MODEL_KEY_DELIMITER = '::'
const FAVORITES_CACHE_TTL_MS = 15 * 1000
const RECENTS_CACHE_TTL_MS = 15 * 1000
const MAX_CACHE_ENTRIES = 64
const DEFAULT_RECENTS_LIMIT = 20

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

export type ModelPrefsScopeType = 'global' | 'project' | 'conversation'

export type ModelPrefsScopeInput = Readonly<{
  scopeType?: ModelPrefsScopeType
  scopeId?: string | null
}>

export type ModelPrefsModelRefInput = Readonly<{
  modelKey?: string
  providerKey?: string
  modelId?: string
}>

export type ModelPrefsFavorite = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  sortRank: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsRecent = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  lastUsedAtMs: number
  useCount: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsToggleFavoriteResult = Readonly<{
  ok: boolean
  favorited: boolean
  item: ModelPrefsFavorite | null
  error: string | null
}>

export type ModelPrefsRemoveFavoriteResult = Readonly<{
  ok: boolean
  removed: number
  error: string | null
}>

export type ModelPrefsServiceEvent = Readonly<{
  kind: 'favorites' | 'recents'
  scopeType: ModelPrefsScopeType
  scopeId: string
  reason: 'refresh' | 'mutation' | 'invalidate'
}>

type NormalizedScope = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
}>

type NormalizedModelRef = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
}>

type FavoritesCacheEntry = Readonly<{
  fetchedAtMs: number
  expiresAtMs: number
  items: readonly ModelPrefsFavorite[]
}>

type RecentsCacheEntry = Readonly<{
  fetchedAtMs: number
  expiresAtMs: number
  items: readonly ModelPrefsRecent[]
}>

const favoriteCache = new Map<string, FavoritesCacheEntry>()
const recentsCache = new Map<string, RecentsCacheEntry>()
const favoritesInFlight = new Map<string, Promise<ModelPrefsFavorite[]>>()
const recentsInFlight = new Map<string, Promise<ModelPrefsRecent[]>>()
const listeners = new Set<(event: ModelPrefsServiceEvent) => void>()

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function parseModelKey(modelKey: string): Readonly<{ providerKey: string; modelId: string }> | null {
  const normalized = String(modelKey ?? '').trim()
  const separatorIndex = normalized.indexOf(MODEL_KEY_DELIMITER)
  if (separatorIndex <= 0 || separatorIndex + MODEL_KEY_DELIMITER.length >= normalized.length) return null
  const providerKey = normalized.slice(0, separatorIndex).trim()
  const modelId = normalized.slice(separatorIndex + MODEL_KEY_DELIMITER.length).trim()
  if (!providerKey || !modelId) return null
  return { providerKey, modelId }
}

function normalizeScope(scope?: ModelPrefsScopeInput): NormalizedScope {
  const scopeType = scope?.scopeType ?? 'global'
  if (scopeType !== 'global' && scopeType !== 'project' && scopeType !== 'conversation') {
    throw new Error(`Invalid scopeType: ${String(scopeType)}`)
  }
  const scopeId = String(scope?.scopeId ?? '').trim()
  if (scopeType === 'global') {
    return { scopeType, scopeId: '' }
  }
  if (!scopeId) {
    throw new Error(`${scopeType} scope requires non-empty scopeId`)
  }
  return { scopeType, scopeId }
}

function normalizeModelRef(ref: ModelPrefsModelRefInput): NormalizedModelRef {
  const parsed = parseModelKey(String(ref.modelKey ?? '').trim())
  const providerKey = String(ref.providerKey ?? '').trim() || parsed?.providerKey || ''
  const modelId = String(ref.modelId ?? '').trim() || parsed?.modelId || ''
  if (!providerKey || !modelId) {
    throw new Error('model refs require modelKey or providerKey+modelId')
  }
  if (
    parsed &&
    (parsed.providerKey !== providerKey || parsed.modelId !== modelId)
  ) {
    throw new Error('modelKey mismatch with providerKey/modelId')
  }
  return {
    providerKey,
    modelId,
    modelKey: `${providerKey}${MODEL_KEY_DELIMITER}${modelId}`,
  }
}

function favoriteCacheKey(scope: NormalizedScope): string {
  return `${scope.scopeType}|${scope.scopeId}`
}

function recentsCacheKey(scope: NormalizedScope, limit: number): string {
  return `${scope.scopeType}|${scope.scopeId}|${limit}`
}

function lruSet<K, V>(cache: Map<K, V>, key: K, value: V) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value
    if (!first) break
    cache.delete(first)
  }
}

function emitEvent(event: ModelPrefsServiceEvent) {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // ignore listener error in renderer utility layer
    }
  }
}

function cloneFavorites(items: readonly ModelPrefsFavorite[]): ModelPrefsFavorite[] {
  return items.map((item) => ({ ...item }))
}

function cloneRecents(items: readonly ModelPrefsRecent[]): ModelPrefsRecent[] {
  return items.map((item) => ({ ...item }))
}

function decodeFavorite(row: unknown): ModelPrefsFavorite | null {
  if (!row || typeof row !== 'object') return null
  const raw = row as Record<string, unknown>
  const scopeType =
    raw.scopeType === 'project' || raw.scopeType === 'conversation'
      ? raw.scopeType
      : 'global'
  const scopeId = String(raw.scopeId ?? '').trim()
  const modelKey = String(raw.modelKey ?? '').trim()
  const providerKey = String(raw.providerKey ?? '').trim()
  const modelId = String(raw.modelId ?? '').trim()
  if (!modelKey || !providerKey || !modelId) return null
  const sortRank =
    typeof raw.sortRank === 'number' && Number.isFinite(raw.sortRank)
      ? Math.floor(raw.sortRank)
      : 0
  const createdAtMs =
    typeof raw.createdAtMs === 'number' && Number.isFinite(raw.createdAtMs)
      ? Math.floor(raw.createdAtMs)
      : 0
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs)
      ? Math.floor(raw.updatedAtMs)
      : createdAtMs
  return {
    scopeType,
    scopeId: scopeType === 'global' ? '' : scopeId,
    providerKey,
    modelId,
    modelKey,
    sortRank,
    createdAtMs,
    updatedAtMs,
  }
}

function decodeRecent(row: unknown): ModelPrefsRecent | null {
  if (!row || typeof row !== 'object') return null
  const raw = row as Record<string, unknown>
  const scopeType =
    raw.scopeType === 'project' || raw.scopeType === 'conversation'
      ? raw.scopeType
      : 'global'
  const scopeId = String(raw.scopeId ?? '').trim()
  const modelKey = String(raw.modelKey ?? '').trim()
  const providerKey = String(raw.providerKey ?? '').trim()
  const modelId = String(raw.modelId ?? '').trim()
  if (!modelKey || !providerKey || !modelId) return null
  const lastUsedAtMs =
    typeof raw.lastUsedAtMs === 'number' && Number.isFinite(raw.lastUsedAtMs)
      ? Math.floor(raw.lastUsedAtMs)
      : 0
  const useCount =
    typeof raw.useCount === 'number' && Number.isFinite(raw.useCount)
      ? Math.max(0, Math.floor(raw.useCount))
      : 0
  const createdAtMs =
    typeof raw.createdAtMs === 'number' && Number.isFinite(raw.createdAtMs)
      ? Math.floor(raw.createdAtMs)
      : 0
  const updatedAtMs =
    typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs)
      ? Math.floor(raw.updatedAtMs)
      : createdAtMs
  return {
    scopeType,
    scopeId: scopeType === 'global' ? '' : scopeId,
    providerKey,
    modelId,
    modelKey,
    lastUsedAtMs,
    useCount,
    createdAtMs,
    updatedAtMs,
  }
}

function decodeFavoriteList(raw: unknown): ModelPrefsFavorite[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => decodeFavorite(row)).filter((row): row is ModelPrefsFavorite => row !== null)
}

function decodeRecentList(raw: unknown): ModelPrefsRecent[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => decodeRecent(row)).filter((row): row is ModelPrefsRecent => row !== null)
}

function invalidateFavoritesScope(scope: NormalizedScope) {
  favoriteCache.delete(favoriteCacheKey(scope))
  favoritesInFlight.delete(favoriteCacheKey(scope))
  emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'invalidate' })
}

function invalidateRecentsScope(scope: NormalizedScope) {
  const prefix = `${scope.scopeType}|${scope.scopeId}|`
  for (const key of recentsCache.keys()) {
    if (!key.startsWith(prefix)) continue
    recentsCache.delete(key)
    recentsInFlight.delete(key)
  }
  emitEvent({ kind: 'recents', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'invalidate' })
}

function normalizeOrderedModelKeys(input: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const normalized = String(raw ?? '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export class ModelPrefsService {
  static subscribe(listener: (event: ModelPrefsServiceEvent) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  static async listFavorites(
    scopeInput?: ModelPrefsScopeInput,
    options?: Readonly<{ forceRefresh?: boolean }>
  ): Promise<ModelPrefsFavorite[]> {
    let scope: NormalizedScope
    try {
      scope = normalizeScope(scopeInput)
    } catch {
      return []
    }

    const key = favoriteCacheKey(scope)
    const nowMs = Date.now()
    const forceRefresh = options?.forceRefresh === true
    const cached = favoriteCache.get(key) ?? null
    if (!forceRefresh && cached && cached.expiresAtMs > nowMs) {
      return cloneFavorites(cached.items)
    }
    if (!forceRefresh) {
      const inflight = favoritesInFlight.get(key)
      if (inflight) return inflight
    }

    const bridge = getDbBridge()
    if (!bridge) return []

    const promise = (async () => {
      try {
        const raw = await bridge.invoke('modelPrefs.listFavorites', {
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        })
        const items = decodeFavoriteList(raw)
        lruSet(favoriteCache, key, {
          fetchedAtMs: nowMs,
          expiresAtMs: nowMs + FAVORITES_CACHE_TTL_MS,
          items,
        })
        emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'refresh' })
        return cloneFavorites(items)
      } catch {
        return cached ? cloneFavorites(cached.items) : []
      } finally {
        favoritesInFlight.delete(key)
      }
    })()
    favoritesInFlight.set(key, promise)
    return promise
  }

  static async toggleFavorite(
    modelInput: ModelPrefsModelRefInput,
    scopeInput?: ModelPrefsScopeInput
  ): Promise<ModelPrefsToggleFavoriteResult> {
    let scope: NormalizedScope
    let modelRef: NormalizedModelRef
    try {
      scope = normalizeScope(scopeInput)
      modelRef = normalizeModelRef(modelInput)
    } catch (error: any) {
      return {
        ok: false,
        favorited: false,
        item: null,
        error: typeof error?.message === 'string' ? error.message : 'Invalid model preference input.',
      }
    }
    const bridge = getDbBridge()
    if (!bridge) {
      return {
        ok: false,
        favorited: false,
        item: null,
        error: 'Missing dbBridge.',
      }
    }

    const currentFavorites = await this.listFavorites(scope)
    const existing = currentFavorites.find((item) => item.modelKey === modelRef.modelKey) ?? null

    try {
      if (existing) {
        const removeRaw = await bridge.invoke('modelPrefs.removeFavorite', {
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          providerKey: modelRef.providerKey,
          modelId: modelRef.modelId,
          modelKey: modelRef.modelKey,
        })
        const removed =
          typeof removeRaw?.removed === 'number' && Number.isFinite(removeRaw.removed)
            ? Math.max(0, Math.floor(removeRaw.removed))
            : 0
        if (removed > 0) {
          const key = favoriteCacheKey(scope)
          const cacheEntry = favoriteCache.get(key)
          if (cacheEntry) {
            const items = cacheEntry.items.filter((item) => item.modelKey !== modelRef.modelKey)
            lruSet(favoriteCache, key, {
              fetchedAtMs: Date.now(),
              expiresAtMs: Date.now() + FAVORITES_CACHE_TTL_MS,
              items,
            })
          } else {
            invalidateFavoritesScope(scope)
          }
          emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'mutation' })
        }
        return {
          ok: true,
          favorited: false,
          item: null,
          error: null,
        }
      }

      const addRaw = await bridge.invoke('modelPrefs.addFavorite', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        providerKey: modelRef.providerKey,
        modelId: modelRef.modelId,
        modelKey: modelRef.modelKey,
      })
      const added = decodeFavorite(addRaw)
      if (!added) {
        invalidateFavoritesScope(scope)
        return {
          ok: false,
          favorited: false,
          item: null,
          error: 'Favorite write succeeded but response payload is invalid.',
        }
      }
      const key = favoriteCacheKey(scope)
      const cacheEntry = favoriteCache.get(key)
      const nextItems = cacheEntry ? [...cacheEntry.items] : []
      const existingIndex = nextItems.findIndex((item) => item.modelKey === added.modelKey)
      if (existingIndex >= 0) {
        nextItems[existingIndex] = added
      } else {
        nextItems.push(added)
      }
      nextItems.sort((a, b) => (a.sortRank === b.sortRank ? a.modelKey.localeCompare(b.modelKey) : a.sortRank - b.sortRank))
      lruSet(favoriteCache, key, {
        fetchedAtMs: Date.now(),
        expiresAtMs: Date.now() + FAVORITES_CACHE_TTL_MS,
        items: nextItems,
      })
      emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'mutation' })
      return {
        ok: true,
        favorited: true,
        item: added,
        error: null,
      }
    } catch (error: any) {
      return {
        ok: false,
        favorited: Boolean(existing),
        item: existing,
        error: typeof error?.message === 'string' ? error.message : 'Failed to toggle favorite.',
      }
    }
  }

  static async reorderFavorites(
    orderedModelKeys: readonly string[],
    scopeInput?: ModelPrefsScopeInput
  ): Promise<ModelPrefsFavorite[]> {
    let scope: NormalizedScope
    try {
      scope = normalizeScope(scopeInput)
    } catch {
      return []
    }
    const normalizedKeys = normalizeOrderedModelKeys(orderedModelKeys)
    if (normalizedKeys.length === 0) {
      return this.listFavorites(scope)
    }
    const bridge = getDbBridge()
    if (!bridge) return []

    try {
      const raw = await bridge.invoke('modelPrefs.reorderFavorites', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        orderedModelKeys: normalizedKeys,
      })
      const rows = Array.isArray(raw?.items) ? raw.items : raw
      const items = decodeFavoriteList(rows)
      const nowMs = Date.now()
      lruSet(favoriteCache, favoriteCacheKey(scope), {
        fetchedAtMs: nowMs,
        expiresAtMs: nowMs + FAVORITES_CACHE_TTL_MS,
        items,
      })
      emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'mutation' })
      return cloneFavorites(items)
    } catch {
      return this.listFavorites(scope, { forceRefresh: true })
    }
  }

  static async removeFavorite(
    modelInput: ModelPrefsModelRefInput,
    scopeInput?: ModelPrefsScopeInput
  ): Promise<ModelPrefsRemoveFavoriteResult> {
    let scope: NormalizedScope
    let modelRef: NormalizedModelRef
    try {
      scope = normalizeScope(scopeInput)
      modelRef = normalizeModelRef(modelInput)
    } catch (error: any) {
      return {
        ok: false,
        removed: 0,
        error: typeof error?.message === 'string' ? error.message : 'Invalid model preference input.',
      }
    }
    const bridge = getDbBridge()
    if (!bridge) {
      return { ok: false, removed: 0, error: 'Missing dbBridge.' }
    }
    try {
      const raw = await bridge.invoke('modelPrefs.removeFavorite', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        providerKey: modelRef.providerKey,
        modelId: modelRef.modelId,
        modelKey: modelRef.modelKey,
      })
      const removed =
        typeof raw?.removed === 'number' && Number.isFinite(raw.removed)
          ? Math.max(0, Math.floor(raw.removed))
          : 0
      if (removed > 0) {
        const key = favoriteCacheKey(scope)
        const cacheEntry = favoriteCache.get(key)
        if (cacheEntry) {
          const items = cacheEntry.items.filter((item) => item.modelKey !== modelRef.modelKey)
          lruSet(favoriteCache, key, {
            fetchedAtMs: Date.now(),
            expiresAtMs: Date.now() + FAVORITES_CACHE_TTL_MS,
            items,
          })
        } else {
          invalidateFavoritesScope(scope)
        }
        emitEvent({ kind: 'favorites', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'mutation' })
      }
      return { ok: true, removed, error: null }
    } catch (error: any) {
      return {
        ok: false,
        removed: 0,
        error: typeof error?.message === 'string' ? error.message : 'Failed to remove favorite.',
      }
    }
  }

  static async listRecents(
    scopeInput?: ModelPrefsScopeInput,
    options?: Readonly<{ forceRefresh?: boolean; limit?: number }>
  ): Promise<ModelPrefsRecent[]> {
    let scope: NormalizedScope
    try {
      scope = normalizeScope(scopeInput)
    } catch {
      return []
    }
    const normalizedLimitRaw =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.floor(options.limit)
        : DEFAULT_RECENTS_LIMIT
    const limit = Math.max(1, Math.min(500, normalizedLimitRaw))
    const key = recentsCacheKey(scope, limit)
    const nowMs = Date.now()
    const forceRefresh = options?.forceRefresh === true
    const cached = recentsCache.get(key) ?? null
    if (!forceRefresh && cached && cached.expiresAtMs > nowMs) {
      return cloneRecents(cached.items)
    }
    if (!forceRefresh) {
      const inflight = recentsInFlight.get(key)
      if (inflight) return inflight
    }

    const bridge = getDbBridge()
    if (!bridge) return []

    const promise = (async () => {
      try {
        const raw = await bridge.invoke('modelPrefs.listRecents', {
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          limit,
        })
        const items = decodeRecentList(raw)
        lruSet(recentsCache, key, {
          fetchedAtMs: nowMs,
          expiresAtMs: nowMs + RECENTS_CACHE_TTL_MS,
          items,
        })
        emitEvent({ kind: 'recents', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'refresh' })
        return cloneRecents(items)
      } catch {
        return cached ? cloneRecents(cached.items) : []
      } finally {
        recentsInFlight.delete(key)
      }
    })()
    recentsInFlight.set(key, promise)
    return promise
  }

  static async recordRecent(
    modelInput: ModelPrefsModelRefInput,
    scopeInput?: ModelPrefsScopeInput
  ): Promise<ModelPrefsRecent | null> {
    let scope: NormalizedScope
    let modelRef: NormalizedModelRef
    try {
      scope = normalizeScope(scopeInput)
      modelRef = normalizeModelRef(modelInput)
    } catch {
      return null
    }
    const bridge = getDbBridge()
    if (!bridge) return null

    try {
      const raw = await bridge.invoke('modelPrefs.recordRecent', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        providerKey: modelRef.providerKey,
        modelId: modelRef.modelId,
        modelKey: modelRef.modelKey,
        usedAtMs: Date.now(),
      })
      const row = decodeRecent(raw)
      invalidateRecentsScope(scope)
      emitEvent({ kind: 'recents', scopeType: scope.scopeType, scopeId: scope.scopeId, reason: 'mutation' })
      return row
    } catch {
      return null
    }
  }

  static invalidate(scopeInput?: ModelPrefsScopeInput) {
    try {
      const scope = normalizeScope(scopeInput)
      invalidateFavoritesScope(scope)
      invalidateRecentsScope(scope)
    } catch {
      // no-op
    }
  }
}

export function __resetModelPrefsServiceCacheForTests() {
  favoriteCache.clear()
  recentsCache.clear()
  favoritesInFlight.clear()
  recentsInFlight.clear()
  listeners.clear()
}
