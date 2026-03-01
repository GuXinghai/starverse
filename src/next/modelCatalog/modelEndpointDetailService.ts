import { PROVIDERS } from '../../constants/providers'
import { OpenRouterCatalogClient } from '../../shared/modelCatalog/openRouterCatalogClient'
import type { CatalogEndpointMetric } from '../../shared/modelCatalog/internalSchema'
import { buildModelKeyForLog, logModelCatalogEvent } from './modelCatalogObservability'

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const ENDPOINT_VOLATILE_CACHE_TTL_MS = 10 * 60 * 1000
const ENDPOINT_VOLATILE_CACHE_CAPACITY = 120

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

type ElectronStoreBridge = Readonly<{
  get?: (key: string) => Promise<unknown>
}>

type EndpointVolatile = Readonly<{
  uptimeLast30m: number | null
  latencyLast30m: CatalogEndpointMetric | null
  throughputLast30m: CatalogEndpointMetric | null
  status: number | null
}>

type EndpointVolatileCacheEntry = Readonly<{
  fetchedAtMs: number
  expiresAtMs: number
  valuesByEndpointKey: ReadonlyMap<string, EndpointVolatile>
}>

type EndpointMetaRow = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  endpointKey: string
  providerName: string | null
  tag: string | null
  quantization: string | null
  contextLength: number | null
  maxCompletionTokens: number | null
  maxPromptTokens: number | null
  supportedParametersJson: string | null
  supportsImplicitCaching: 0 | 1 | null
  rawJson: string | null
  fetchedAtMs: number
}>

export type ModelEndpointDetail = Readonly<{
  endpointKey: string
  providerName: string | null
  tag: string | null
  quantization: string | null
  contextLength: number | null
  maxCompletionTokens: number | null
  maxPromptTokens: number | null
  supportedParameters: string[]
  supportsImplicitCaching: boolean | null
  status: number | null
  uptimeLast30m: number | null
  latencyLast30m: CatalogEndpointMetric | null
  throughputLast30m: CatalogEndpointMetric | null
  rawJson: string | null
}>

export type ModelEndpointDetailsResult = Readonly<{
  providerKey: string
  modelId: string
  fetchedAtMs: number | null
  source: 'network' | 'cache'
  items: ReadonlyArray<ModelEndpointDetail>
  error: string | null
}>

export type GetModelEndpointDetailsInput = Readonly<{
  modelId: string
  providerKey?: string
  forceRefresh?: boolean
}>

const endpointVolatileCache = new Map<string, EndpointVolatileCacheEntry>()

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function getElectronStoreBridge(): ElectronStoreBridge | null {
  const store = (globalThis as any).electronStore as ElectronStoreBridge | undefined
  if (!store || typeof store !== 'object') return null
  return store
}

function normalizeBaseUrl(baseUrl?: string | null): string {
  const raw = String(baseUrl ?? '').trim()
  const resolved = raw.length > 0 ? raw : OPENROUTER_DEFAULT_BASE_URL
  return resolved.replace(/\/+$/, '')
}

function parseModelId(modelId: string): Readonly<{ author: string; slug: string }> | null {
  const normalized = String(modelId ?? '').trim()
  const slash = normalized.indexOf('/')
  if (slash <= 0 || slash + 1 >= normalized.length) return null
  const author = normalized.slice(0, slash).trim()
  const slug = normalized.slice(slash + 1).trim()
  if (!author || !slug) return null
  return { author, slug }
}

function normalizeEndpointPart(value: unknown): string {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : '_'
}

export function buildEndpointKey(
  modelId: string,
  input: Readonly<{ tag?: string | null; quantization?: string | null; providerName?: string | null }>
): string {
  return [
    String(modelId ?? '').trim() || '_',
    normalizeEndpointPart(input.tag),
    normalizeEndpointPart(input.quantization),
    normalizeEndpointPart(input.providerName),
  ].join('::')
}

function toVolatileCacheKey(providerKey: string, baseUrl: string, modelId: string): string {
  return `${providerKey}|${baseUrl}|${modelId}`
}

function lruSetVolatileCache(key: string, value: EndpointVolatileCacheEntry) {
  if (endpointVolatileCache.has(key)) {
    endpointVolatileCache.delete(key)
  }
  endpointVolatileCache.set(key, value)
  while (endpointVolatileCache.size > ENDPOINT_VOLATILE_CACHE_CAPACITY) {
    const firstKey = endpointVolatileCache.keys().next().value
    if (!firstKey) break
    endpointVolatileCache.delete(firstKey)
  }
}

function getVolatileCache(key: string, nowMs: number): EndpointVolatileCacheEntry | null {
  const cached = endpointVolatileCache.get(key) ?? null
  if (!cached) return null
  if (cached.expiresAtMs <= nowMs) {
    endpointVolatileCache.delete(key)
    return null
  }
  endpointVolatileCache.delete(key)
  endpointVolatileCache.set(key, cached)
  return cached
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0)
  } catch {
    return []
  }
}

function normalizeMetric(raw: unknown): CatalogEndpointMetric | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const metric: CatalogEndpointMetric = {
    ...(typeof obj.p50 === 'number' && Number.isFinite(obj.p50) ? { p50: obj.p50 } : {}),
    ...(typeof obj.p75 === 'number' && Number.isFinite(obj.p75) ? { p75: obj.p75 } : {}),
    ...(typeof obj.p90 === 'number' && Number.isFinite(obj.p90) ? { p90: obj.p90 } : {}),
    ...(typeof obj.p99 === 'number' && Number.isFinite(obj.p99) ? { p99: obj.p99 } : {}),
  }
  return Object.keys(metric).length > 0 ? metric : null
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function mergeDetails(
  rows: readonly EndpointMetaRow[],
  volatileByEndpointKey: ReadonlyMap<string, EndpointVolatile>
): ModelEndpointDetail[] {
  return rows.map((row) => {
    const volatile = volatileByEndpointKey.get(row.endpointKey) ?? null
    return {
      endpointKey: row.endpointKey,
      providerName: row.providerName,
      tag: row.tag,
      quantization: row.quantization,
      contextLength: row.contextLength,
      maxCompletionTokens: row.maxCompletionTokens,
      maxPromptTokens: row.maxPromptTokens,
      supportedParameters: parseStringArray(row.supportedParametersJson),
      supportsImplicitCaching:
        row.supportsImplicitCaching === 0 || row.supportsImplicitCaching === 1
          ? row.supportsImplicitCaching === 1
          : null,
      status:
        typeof volatile?.status === 'number' && Number.isFinite(volatile.status)
          ? volatile.status
          : null,
      uptimeLast30m: volatile?.uptimeLast30m ?? null,
      latencyLast30m: volatile?.latencyLast30m ?? null,
      throughputLast30m: volatile?.throughputLast30m ?? null,
      rawJson: row.rawJson ?? null,
    }
  })
}

async function readCoreBaseUrl(bridge: DbBridge, providerKey: string): Promise<string | null> {
  try {
    const raw = await bridge.invoke('modelCatalog.getCoreMeta', { providerKey })
    const baseUrl = String(raw?.baseUrl ?? '').trim()
    return baseUrl.length > 0 ? baseUrl : null
  } catch {
    return null
  }
}

async function readOpenRouterConfig(
  bridge: DbBridge,
  providerKey: string
): Promise<Readonly<{ apiKey: string; baseUrl: string }>> {
  const store = getElectronStoreBridge()
  const apiKey =
    store?.get && typeof store.get === 'function'
      ? String((await store.get('openRouterApiKey')) ?? '').trim()
      : ''
  const baseUrlFromStore =
    store?.get && typeof store.get === 'function'
      ? String((await store.get('openRouterBaseUrl')) ?? '').trim()
      : ''
  const baseUrlFromMeta = await readCoreBaseUrl(bridge, providerKey)
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrlFromMeta ?? baseUrlFromStore),
  }
}

async function listEndpointMetaRows(
  bridge: DbBridge,
  providerKey: string,
  baseUrl: string,
  modelId: string
): Promise<EndpointMetaRow[]> {
  const raw = await bridge.invoke('modelCatalog.listEndpointMeta', { providerKey, baseUrl, modelId })
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Record<string, unknown>
      const endpointKey = String(item.endpointKey ?? '').trim()
      if (!endpointKey) return null
      return {
        providerKey: String(item.providerKey ?? '').trim(),
        baseUrl: String(item.baseUrl ?? '').trim(),
        modelId: String(item.modelId ?? '').trim(),
        endpointKey,
        providerName: typeof item.providerName === 'string' ? item.providerName : null,
        tag: typeof item.tag === 'string' ? item.tag : null,
        quantization: typeof item.quantization === 'string' ? item.quantization : null,
        contextLength:
          typeof item.contextLength === 'number' && Number.isFinite(item.contextLength)
            ? item.contextLength
            : null,
        maxCompletionTokens:
          typeof item.maxCompletionTokens === 'number' && Number.isFinite(item.maxCompletionTokens)
            ? item.maxCompletionTokens
            : null,
        maxPromptTokens:
          typeof item.maxPromptTokens === 'number' && Number.isFinite(item.maxPromptTokens)
            ? item.maxPromptTokens
            : null,
        supportedParametersJson:
          typeof item.supportedParametersJson === 'string' ? item.supportedParametersJson : null,
        supportsImplicitCaching:
          item.supportsImplicitCaching === 0 || item.supportsImplicitCaching === 1
            ? item.supportsImplicitCaching
            : null,
        rawJson: typeof item.rawJson === 'string' ? item.rawJson : null,
        fetchedAtMs:
          typeof item.fetchedAtMs === 'number' && Number.isFinite(item.fetchedAtMs)
            ? item.fetchedAtMs
            : 0,
      } satisfies EndpointMetaRow
    })
    .filter((row): row is EndpointMetaRow => row !== null)
}

function maxFetchedAt(rows: readonly EndpointMetaRow[]): number | null {
  if (rows.length === 0) return null
  const value = Math.max(...rows.map((row) => row.fetchedAtMs))
  return Number.isFinite(value) ? value : null
}

export async function getModelEndpointDetails(
  input: GetModelEndpointDetailsInput
): Promise<ModelEndpointDetailsResult> {
  const startedAtMs = Date.now()
  const providerKey = String(input.providerKey ?? PROVIDERS.OPENROUTER).trim() || PROVIDERS.OPENROUTER
  const modelId = String(input.modelId ?? '').trim()
  const modelKey = buildModelKeyForLog(providerKey, modelId)
  const forceRefresh = input.forceRefresh === true
  const bridge = getDbBridge()
  if (!bridge || !modelId) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'input_validation',
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
      reason: 'missing_dbBridge_or_modelId',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: null,
      source: 'cache',
      items: [],
      error: 'Endpoint details unavailable (dbBridge/modelId missing).',
    }
  }

  const parsedModelId = parseModelId(modelId)
  if (!parsedModelId) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'input_validation',
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
      reason: 'invalid_model_id_format',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: null,
      source: 'cache',
      items: [],
      error: 'Endpoint details unavailable (invalid modelId, expected author/slug).',
    }
  }

  const { apiKey, baseUrl } = await readOpenRouterConfig(bridge, providerKey)
  const nowMs = Date.now()
  const volatileCacheKey = toVolatileCacheKey(providerKey, baseUrl, modelId)
  const volatileCache = getVolatileCache(volatileCacheKey, nowMs)
  const volatileByEndpointKey = volatileCache?.valuesByEndpointKey ?? new Map<string, EndpointVolatile>()
  const diskRows = await listEndpointMetaRows(bridge, providerKey, baseUrl, modelId)

  if (forceRefresh) {
    logModelCatalogEvent('endpoints', 'refresh', {
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      hadDiskCache: diskRows.length > 0,
      diskItemCount: diskRows.length,
    })
  } else if (diskRows.length > 0) {
    logModelCatalogEvent('endpoints', 'cache_hit', {
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      layer: 'disk',
      itemCount: diskRows.length,
    })
  } else {
    logModelCatalogEvent('endpoints', 'cache_miss', {
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      reason: 'disk_cache_empty',
    })
  }

  if (!forceRefresh && diskRows.length > 0) {
    return {
      providerKey,
      modelId,
      fetchedAtMs: maxFetchedAt(diskRows),
      source: 'cache',
      items: mergeDetails(diskRows, volatileByEndpointKey),
      error: null,
    }
  }

  if (!apiKey) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'auth',
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      durationMs: Date.now() - startedAtMs,
      reason: 'missing_api_key',
      fallback: diskRows.length > 0 ? 'cache' : 'empty',
      fallbackItemCount: diskRows.length,
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: maxFetchedAt(diskRows),
      source: 'cache',
      items: mergeDetails(diskRows, volatileByEndpointKey),
      error: diskRows.length > 0 ? 'Missing OpenRouter API key. Showing cached endpoint details.' : 'Missing OpenRouter API key.',
    }
  }

  try {
    const client = new OpenRouterCatalogClient({ fetchImpl: fetch })
    const network = await client.getModelEndpoints({
      apiKey,
      baseUrl,
      modelId,
      author: parsedModelId.author,
      slug: parsedModelId.slug,
    })

    const volatilePairs = network.endpoints.map((endpoint) => {
      const endpointKey = buildEndpointKey(modelId, {
        tag: endpoint.tag ?? null,
        quantization: endpoint.quantization ?? null,
        providerName: endpoint.providerName ?? null,
      })
      return [
        endpointKey,
        {
          uptimeLast30m:
            typeof endpoint.uptimeLast30m === 'number' && Number.isFinite(endpoint.uptimeLast30m)
              ? endpoint.uptimeLast30m
              : null,
          latencyLast30m: normalizeMetric(endpoint.latencyLast30m),
          throughputLast30m: normalizeMetric(endpoint.throughputLast30m),
          status:
            typeof endpoint.status === 'number' && Number.isFinite(endpoint.status)
              ? endpoint.status
              : null,
        } satisfies EndpointVolatile,
      ] as const
    })
    const volatileMap = new Map<string, EndpointVolatile>(volatilePairs)
    lruSetVolatileCache(volatileCacheKey, {
      fetchedAtMs: network.fetchedAtMs,
      expiresAtMs: network.fetchedAtMs + ENDPOINT_VOLATILE_CACHE_TTL_MS,
      valuesByEndpointKey: volatileMap,
    })

    const upsertRows = network.endpoints.map((endpoint) => ({
      providerKey,
      baseUrl,
      modelId,
      endpointKey: buildEndpointKey(modelId, {
        tag: endpoint.tag ?? null,
        quantization: endpoint.quantization ?? null,
        providerName: endpoint.providerName ?? null,
      }),
      providerName: endpoint.providerName ?? null,
      tag: endpoint.tag ?? null,
      quantization: endpoint.quantization ?? null,
      contextLength: endpoint.contextLength ?? null,
      maxCompletionTokens: endpoint.maxCompletionTokens ?? null,
      maxPromptTokens: endpoint.maxPromptTokens ?? null,
      supportedParametersJson: safeStringify(endpoint.supportedParameters ?? []),
      supportsImplicitCaching:
        endpoint.supportsImplicitCaching === true
          ? 1
          : endpoint.supportsImplicitCaching === false
            ? 0
            : null,
      status: null,
      rawJson: safeStringify(endpoint),
    }))
    await bridge.invoke('modelCatalog.replaceEndpointMeta', {
      providerKey,
      baseUrl,
      modelId,
      fetchedAtMs: network.fetchedAtMs,
      endpoints: upsertRows,
    })

    const refreshedRows = await listEndpointMetaRows(bridge, providerKey, baseUrl, modelId)
    logModelCatalogEvent('endpoints', 'fetch_success', {
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      durationMs: Date.now() - startedAtMs,
      forceRefresh,
      networkItemCount: network.endpoints.length,
      persistedItemCount: refreshedRows.length,
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: network.fetchedAtMs,
      source: 'network',
      items: mergeDetails(refreshedRows, volatileMap),
      error: null,
    }
  } catch (error: any) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'network_or_upsert',
      providerKey,
      modelId,
      modelKey,
      baseUrl,
      durationMs: Date.now() - startedAtMs,
      forceRefresh,
      fallback: 'cache',
      fallbackItemCount: diskRows.length,
      reason:
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message.trim()
          : 'unknown_error',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: maxFetchedAt(diskRows),
      source: 'cache',
      items: mergeDetails(diskRows, volatileByEndpointKey),
      error:
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'Failed to fetch model endpoint details.',
    }
  }
}

export function __resetModelEndpointDetailCacheForTests() {
  endpointVolatileCache.clear()
}
