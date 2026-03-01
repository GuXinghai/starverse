import { PROVIDERS } from '../../constants/providers'
import { buildModelKeyForLog, logModelCatalogEvent } from './modelCatalogObservability'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

type PricingFieldKey =
  | 'prompt'
  | 'completion'
  | 'request'
  | 'image'
  | 'webSearch'
  | 'internalReasoning'
  | 'inputCacheRead'
  | 'inputCacheWrite'

export type GetModelCatalogModelDetailInput = Readonly<{
  modelId: string
  providerKey?: string
}>

export type ModelCatalogModelDetail = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  family: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  architectureModality: string | null
  inputModalities: string[]
  outputModalities: string[]
  tokenizer: string | null
  instructType: string | null
  supportedParameters: string[]
  capabilities: Readonly<{
    reasoning: boolean
    tools: boolean
    structuredOutputs: boolean
    vision: boolean
    longContext: boolean
  }>
  pricing: Readonly<{
    prompt: string | null
    completion: string | null
    request: string | null
    image: string | null
    webSearch: string | null
    internalReasoning: string | null
    inputCacheRead: string | null
    inputCacheWrite: string | null
  }>
  createdAtSec: number | null
  expirationDate: string | null
  expirationAtSec: number | null
  unknownExpiration: boolean
  hasPerRequestLimits: boolean
  hasDefaultParameters: boolean
  perRequestLimits: unknown | null
  defaultParameters: unknown | null
  topProviderContextLength: number | null
  topProviderIsModerated: boolean | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  raw: Readonly<{
    inputModalitiesJson: string
    outputModalitiesJson: string
    supportedParametersJson: string
    capabilitiesJson: string
    pricingJson: string | null
    perRequestLimitsJson: string | null
    defaultParametersJson: string | null
    rawJson: string | null
  }>
}>

export type ModelCatalogModelDetailResult = Readonly<{
  providerKey: string
  modelId: string
  item: ModelCatalogModelDetail | null
  error: string | null
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function parseJsonValue(raw: string | null | undefined): unknown | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function parseStringArray(raw: string | null | undefined): string[] {
  const parsed = parseJsonValue(raw)
  if (!Array.isArray(parsed)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of parsed) {
    const normalized = String(value ?? '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function parseNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function parseBooleanOrNull(value: unknown): boolean | null {
  if (value === 0) return false
  if (value === 1) return true
  return null
}

function parsePricing(row: Record<string, unknown>): ModelCatalogModelDetail['pricing'] {
  const fromColumns: Record<PricingFieldKey, string | null> = {
    prompt: typeof row.pricePrompt === 'string' ? row.pricePrompt : null,
    completion: typeof row.priceCompletion === 'string' ? row.priceCompletion : null,
    request: typeof row.priceRequest === 'string' ? row.priceRequest : null,
    image: typeof row.priceImage === 'string' ? row.priceImage : null,
    webSearch: typeof row.priceWebSearch === 'string' ? row.priceWebSearch : null,
    internalReasoning: typeof row.priceInternalReasoning === 'string' ? row.priceInternalReasoning : null,
    inputCacheRead: typeof row.priceInputCacheRead === 'string' ? row.priceInputCacheRead : null,
    inputCacheWrite: typeof row.priceInputCacheWrite === 'string' ? row.priceInputCacheWrite : null,
  }
  const parsedPricing = parseJsonValue(typeof row.pricingJson === 'string' ? row.pricingJson : null)
  if (!parsedPricing || typeof parsedPricing !== 'object') {
    return fromColumns
  }
  const pricingObject = parsedPricing as Record<string, unknown>
  const pickString = (columnValue: string | null, ...keys: string[]): string | null => {
    if (columnValue !== null) return columnValue
    for (const key of keys) {
      const value = pricingObject[key]
      if (typeof value === 'string') return value
    }
    return null
  }
  return {
    prompt: pickString(fromColumns.prompt, 'prompt'),
    completion: pickString(fromColumns.completion, 'completion'),
    request: pickString(fromColumns.request, 'request'),
    image: pickString(fromColumns.image, 'image'),
    webSearch: pickString(fromColumns.webSearch, 'web_search', 'webSearch'),
    internalReasoning: pickString(fromColumns.internalReasoning, 'internal_reasoning', 'internalReasoning'),
    inputCacheRead: pickString(fromColumns.inputCacheRead, 'input_cache_read', 'inputCacheRead'),
    inputCacheWrite: pickString(fromColumns.inputCacheWrite, 'input_cache_write', 'inputCacheWrite'),
  }
}

function parseCapabilities(row: Record<string, unknown>): ModelCatalogModelDetail['capabilities'] {
  const parsedJson = parseJsonValue(typeof row.capabilitiesJson === 'string' ? row.capabilitiesJson : null)
  const parsedObject = parsedJson && typeof parsedJson === 'object' ? (parsedJson as Record<string, unknown>) : null
  const fromJsonOrFlag = (jsonKey: string, flagValue: unknown): boolean => {
    if (parsedObject && typeof parsedObject[jsonKey] === 'boolean') return parsedObject[jsonKey] as boolean
    return flagValue === 1
  }
  return {
    reasoning: fromJsonOrFlag('reasoning', row.capReasoning),
    tools: fromJsonOrFlag('tools', row.capTools),
    structuredOutputs: fromJsonOrFlag('structuredOutputs', row.capStructuredOutputs),
    vision: fromJsonOrFlag('vision', row.capVision),
    longContext: fromJsonOrFlag('longContext', row.capLongContext),
  }
}

function normalizeDetailRow(
  row: unknown
): ModelCatalogModelDetail | null {
  if (!row || typeof row !== 'object') return null
  const raw = row as Record<string, unknown>
  const providerKey = String(raw.providerKey ?? '').trim()
  const modelId = String(raw.modelId ?? '').trim()
  const modelKey = String(raw.modelKey ?? '').trim()
  const displayName = String(raw.displayName ?? '').trim()
  if (!providerKey || !modelId || !modelKey || !displayName) return null
  return {
    providerKey,
    modelId,
    modelKey,
    canonicalSlug: typeof raw.canonicalSlug === 'string' ? raw.canonicalSlug : null,
    displayName,
    description: typeof raw.description === 'string' ? raw.description : null,
    vendor: typeof raw.vendor === 'string' ? raw.vendor : null,
    family: typeof raw.family === 'string' ? raw.family : null,
    status:
      raw.status === 'deprecated' || raw.status === 'archived'
        ? raw.status
        : 'active',
    visibility: raw.visibility === 'hidden' ? 'hidden' : 'visible',
    contextLength: parseNumberOrNull(raw.contextLength),
    maxOutputTokens: parseNumberOrNull(raw.maxOutputTokens),
    architectureModality: typeof raw.architectureModality === 'string' ? raw.architectureModality : null,
    inputModalities: parseStringArray(typeof raw.inputModalitiesJson === 'string' ? raw.inputModalitiesJson : null),
    outputModalities: parseStringArray(typeof raw.outputModalitiesJson === 'string' ? raw.outputModalitiesJson : null),
    tokenizer: typeof raw.tokenizer === 'string' ? raw.tokenizer : null,
    instructType: typeof raw.instructType === 'string' ? raw.instructType : null,
    supportedParameters: parseStringArray(typeof raw.supportedParametersJson === 'string' ? raw.supportedParametersJson : null),
    capabilities: parseCapabilities(raw),
    pricing: parsePricing(raw),
    createdAtSec: parseNumberOrNull(raw.createdAtSec),
    expirationDate: typeof raw.expirationDate === 'string' ? raw.expirationDate : null,
    expirationAtSec: parseNumberOrNull(raw.expirationAtSec),
    unknownExpiration: raw.unknownExpiration === 1,
    hasPerRequestLimits: raw.hasPerRequestLimits === 1,
    hasDefaultParameters: raw.hasDefaultParameters === 1,
    perRequestLimits: parseJsonValue(typeof raw.perRequestLimitsJson === 'string' ? raw.perRequestLimitsJson : null),
    defaultParameters: parseJsonValue(typeof raw.defaultParametersJson === 'string' ? raw.defaultParametersJson : null),
    topProviderContextLength: parseNumberOrNull(raw.topProviderContextLength),
    topProviderIsModerated: parseBooleanOrNull(raw.topProviderIsModerated),
    firstSeenAtMs:
      typeof raw.firstSeenAtMs === 'number' && Number.isFinite(raw.firstSeenAtMs)
        ? raw.firstSeenAtMs
        : 0,
    lastSeenAtMs:
      typeof raw.lastSeenAtMs === 'number' && Number.isFinite(raw.lastSeenAtMs)
        ? raw.lastSeenAtMs
        : 0,
    syncedAtMs:
      typeof raw.syncedAtMs === 'number' && Number.isFinite(raw.syncedAtMs)
        ? raw.syncedAtMs
        : 0,
    raw: {
      inputModalitiesJson: typeof raw.inputModalitiesJson === 'string' ? raw.inputModalitiesJson : '[]',
      outputModalitiesJson: typeof raw.outputModalitiesJson === 'string' ? raw.outputModalitiesJson : '[]',
      supportedParametersJson: typeof raw.supportedParametersJson === 'string' ? raw.supportedParametersJson : '[]',
      capabilitiesJson: typeof raw.capabilitiesJson === 'string' ? raw.capabilitiesJson : '{}',
      pricingJson: typeof raw.pricingJson === 'string' ? raw.pricingJson : null,
      perRequestLimitsJson: typeof raw.perRequestLimitsJson === 'string' ? raw.perRequestLimitsJson : null,
      defaultParametersJson: typeof raw.defaultParametersJson === 'string' ? raw.defaultParametersJson : null,
      rawJson: typeof raw.rawJson === 'string' ? raw.rawJson : null,
    },
  }
}

export async function getModelCatalogModelDetail(
  input: GetModelCatalogModelDetailInput
): Promise<ModelCatalogModelDetailResult> {
  const startedAtMs = Date.now()
  const providerKey = String(input.providerKey ?? PROVIDERS.OPENROUTER).trim() || PROVIDERS.OPENROUTER
  const modelId = String(input.modelId ?? '').trim()
  const modelKey = buildModelKeyForLog(providerKey, modelId)
  const bridge = getDbBridge()
  if (!bridge || !modelId) {
    logModelCatalogEvent('detail', 'fetch_fail', {
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
      item: null,
      error: 'Model detail unavailable (dbBridge/modelId missing).',
    }
  }
  try {
    const raw = await bridge.invoke('modelCatalog.getModelDetail', {
      providerKey,
      modelId,
    })
    const item = normalizeDetailRow(raw)
    if (!item) {
      logModelCatalogEvent('detail', 'cache_miss', {
        providerKey,
        modelId,
        modelKey,
        durationMs: Date.now() - startedAtMs,
        reason: 'row_not_found_or_invalid',
      })
      return {
        providerKey,
        modelId,
        item: null,
        error: null,
      }
    }
    logModelCatalogEvent('detail', 'cache_hit', {
      providerKey,
      modelId,
      modelKey,
      durationMs: Date.now() - startedAtMs,
    })
    return {
      providerKey,
      modelId,
      item,
      error: null,
    }
  } catch (error: any) {
    logModelCatalogEvent('detail', 'fetch_fail', {
      stage: 'db_invoke',
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
      item: null,
      error:
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'Failed to load model detail.',
    }
  }
}
