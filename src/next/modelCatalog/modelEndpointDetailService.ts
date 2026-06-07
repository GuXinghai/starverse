import { PROVIDERS } from '../../constants/providers'
import type { CatalogEndpointMetric } from '../../shared/modelCatalog/internalSchema'
import { buildModelKeyForLog, logModelCatalogEvent } from './modelCatalogObservability'

type ElectronCatalogApi = Readonly<{
  modelCatalogQueryScopedCurrent?: (options?: unknown) => Promise<any>
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
  source: 'scoped_catalog' | 'network' | 'cache'
  items: ReadonlyArray<ModelEndpointDetail>
  error: string | null
}>

export type GetModelEndpointDetailsInput = Readonly<{
  modelId: string
  providerKey?: string
  forceRefresh?: boolean
}>

function getElectronCatalogApi(): ElectronCatalogApi | null {
  const api = (globalThis as any).electronAPI as ElectronCatalogApi | undefined
  return api && typeof api.modelCatalogQueryScopedCurrent === 'function' ? api : null
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

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(
    new Set(
      input
        .map((item) => String(item ?? '').trim())
        .filter((item) => item.length > 0)
    )
  )
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rawJsonFromScopedRow(row: Record<string, unknown>): string | null {
  if (typeof row.rawJson === 'string') return row.rawJson
  const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : null
  return typeof raw?.rawJson === 'string' ? raw.rawJson : null
}

function endpointFromScopedRow(row: Record<string, unknown>, modelId: string): ModelEndpointDetail {
  const vendor = typeof row.vendor === 'string' && row.vendor.trim() ? row.vendor.trim() : null
  const providerName = vendor ?? 'Current model'
  return {
    endpointKey: buildEndpointKey(modelId, {
      providerName,
      tag: 'current',
      quantization: null,
    }),
    providerName,
    tag: 'current',
    quantization: null,
    contextLength: numberOrNull(row.contextLength),
    maxCompletionTokens: numberOrNull(row.maxOutputTokens),
    maxPromptTokens: numberOrNull(row.contextLength),
    supportedParameters: normalizeStringArray(row.supportedParameters),
    supportsImplicitCaching: null,
    status: null,
    uptimeLast30m: null,
    latencyLast30m: null,
    throughputLast30m: null,
    rawJson: rawJsonFromScopedRow(row),
  }
}

export async function getModelEndpointDetails(
  input: GetModelEndpointDetailsInput
): Promise<ModelEndpointDetailsResult> {
  const startedAtMs = Date.now()
  const providerKey = String(input.providerKey ?? PROVIDERS.OPENROUTER).trim() || PROVIDERS.OPENROUTER
  const modelId = String(input.modelId ?? '').trim()
  const modelKey = buildModelKeyForLog(providerKey, modelId)
  const catalogApi = getElectronCatalogApi()
  if (!catalogApi?.modelCatalogQueryScopedCurrent || !modelId) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'input_validation',
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
      reason: 'missing_scoped_query_ipc_or_modelId',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: null,
      source: 'scoped_catalog',
      items: [],
      error: 'Endpoint details unavailable.',
    }
  }

  try {
    const raw = await catalogApi.modelCatalogQueryScopedCurrent({
      providerKey,
      modelIds: [modelId],
      limit: 1,
    })
    const row = Array.isArray(raw?.items) && raw.items[0] && typeof raw.items[0] === 'object'
      ? raw.items[0] as Record<string, unknown>
      : null
    if (!row) {
      logModelCatalogEvent('endpoints', 'scoped_miss', {
        providerKey,
        modelId,
        modelKey,
        durationMs: Date.now() - startedAtMs,
        reason: 'scoped_row_not_found',
      })
      return {
        providerKey,
        modelId,
        fetchedAtMs: null,
        source: 'scoped_catalog',
        items: [],
        error: null,
      }
    }

    logModelCatalogEvent('endpoints', input.forceRefresh === true ? 'refresh' : 'scoped_hit', {
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
      source: 'scoped_catalog',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: numberOrNull(row.syncedAtMs),
      source: 'scoped_catalog',
      items: [endpointFromScopedRow(row, modelId)],
      error: null,
    }
  } catch (error: any) {
    logModelCatalogEvent('endpoints', 'fetch_fail', {
      stage: 'scoped_query',
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
      reason:
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message.trim()
          : 'unknown_error',
    })
    return {
      providerKey,
      modelId,
      fetchedAtMs: null,
      source: 'scoped_catalog',
      items: [],
      error:
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'Failed to load endpoint details.',
    }
  }
}

export function __resetModelEndpointDetailCacheForTests() {
  // Endpoint enrichment is intentionally disabled for scoped catalog Phase 6.
}
