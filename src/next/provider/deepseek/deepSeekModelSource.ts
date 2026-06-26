import {
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
  type ProviderModelCapabilitySeed,
  type ProviderModelSourceKind as CommonProviderModelSourceKind,
} from '../modelAvailabilityEnvelope'

export const DEEPSEEK_OFFICIAL_PROVIDER_KEY = 'deepseek' as const
export const DEEPSEEK_OFFICIAL_ENDPOINT_ID = 'deepseek-official' as const
export const DEEPSEEK_OFFICIAL_PROFILE_ID = 'deepseek_official_openai_compat' as const
export const DEEPSEEK_MODELS_DEFAULT_BASE_URL = 'https://api.deepseek.com' as const

export const DEEPSEEK_LIST_MODELS_DOC_URL = 'https://api-docs.deepseek.com/api/list-models' as const
export const DEEPSEEK_MODELS_PRICING_DOC_URL = 'https://api-docs.deepseek.com/quick_start/pricing' as const
export const DEEPSEEK_API_INTRO_DOC_URL = 'https://api-docs.deepseek.com/api/deepseek-api' as const
export const DEEPSEEK_ALIAS_DEPRECATION_AT_ISO = '2026-07-24T15:59:00.000Z' as const

export type ProviderModelSourceKind =
  | 'deepseek_models_api'
  | 'deepseek_pricing_metadata'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

export type DeepSeekProviderSpecificModelAvailability = Readonly<{
  ownedBy?: string
  pricingSeed?: Readonly<{
    inputCacheHitPer1MTokens?: string
    inputCacheMissPer1MTokens?: string
    outputPer1MTokens?: string
    currency?: 'USD'
    source: 'deepseek_pricing_metadata'
    observedAtMs: number
  }>
  alias?: Readonly<{
    deprecated: boolean
    deprecationAtIso: typeof DEEPSEEK_ALIAS_DEPRECATION_AT_ISO
    replacementModelId: 'deepseek-v4-flash'
    mode: 'non-thinking' | 'thinking'
  }>
}>

export type ProviderModelAvailability = ProviderModelAvailabilityEnvelope<
  typeof DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  typeof DEEPSEEK_OFFICIAL_ENDPOINT_ID,
  typeof DEEPSEEK_OFFICIAL_PROFILE_ID,
  DeepSeekProviderSpecificModelAvailability
> & Readonly<{
  source: ProviderModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  displayName?: string
  ownedBy?: string
  capabilitySeed?: Readonly<{
    textChat?: boolean
    thinkingMode?: 'supported' | 'non_thinking_only' | 'thinking_only' | 'unknown'
    contextLength?: number
    maxOutputTokens?: number
    tools?: boolean
    jsonOutput?: boolean
    fim?: boolean
    chatPrefixCompletion?: boolean
  }> & ProviderModelCapabilitySeed
  pricingSeed?: Readonly<{
    inputCacheHitPer1MTokens?: string
    inputCacheMissPer1MTokens?: string
    outputPer1MTokens?: string
    currency?: 'USD'
    source: 'deepseek_pricing_metadata'
    observedAtMs: number
  }>
}>

export type DeepSeekModelSourceDocument = Readonly<{
  source:
    | 'deepseek_list_models_api_docs'
    | 'deepseek_models_pricing_docs'
    | 'deepseek_api_intro_docs'
  url: string
  observedAtMs: number
}>

export type DeepSeekModelAvailabilitySuccess = Readonly<{
  ok: true
  providerKey: typeof DEEPSEEK_OFFICIAL_PROVIDER_KEY
  endpointId: typeof DEEPSEEK_OFFICIAL_ENDPOINT_ID
  profileId: typeof DEEPSEEK_OFFICIAL_PROFILE_ID
  observedAtMs: number
  models: ProviderModelAvailability[]
  warnings: string[]
  sourceDocuments: DeepSeekModelSourceDocument[]
}>

export type DeepSeekModelAvailabilityFailure = Readonly<{
  ok: false
  providerKey: typeof DEEPSEEK_OFFICIAL_PROVIDER_KEY
  endpointId: typeof DEEPSEEK_OFFICIAL_ENDPOINT_ID
  profileId: typeof DEEPSEEK_OFFICIAL_PROFILE_ID
  observedAtMs: number
  code:
    | 'credential_missing'
    | 'store_unavailable'
    | 'invalid_payload'
    | 'invalid_response'
    | 'http_error'
    | 'network_error'
  message: string
  httpStatus?: number
}>

export type DeepSeekModelAvailabilityResult =
  | DeepSeekModelAvailabilitySuccess
  | DeepSeekModelAvailabilityFailure

export type DeepSeekModelsFetchInput = Readonly<{
  apiKey: string
  baseUrl?: string | null
  fetchImpl: typeof fetch
  signal?: AbortSignal | null
  observedAtMs?: number
}>

type ParseResult =
  | Readonly<{ ok: true; models: ProviderModelAvailability[]; warnings: string[] }>
  | Readonly<{ ok: false; code: 'invalid_response'; message: string; warnings: string[] }>

type ModelRecord = Record<string, unknown>

function sourceDocuments(observedAtMs: number): DeepSeekModelSourceDocument[] {
  return [
    {
      source: 'deepseek_list_models_api_docs',
      url: DEEPSEEK_LIST_MODELS_DOC_URL,
      observedAtMs,
    },
    {
      source: 'deepseek_models_pricing_docs',
      url: DEEPSEEK_MODELS_PRICING_DOC_URL,
      observedAtMs,
    },
    {
      source: 'deepseek_api_intro_docs',
      url: DEEPSEEK_API_INTRO_DOC_URL,
      observedAtMs,
    },
  ]
}

function commonSourceKind(source: ProviderModelSourceKind): CommonProviderModelSourceKind {
  if (source === 'deepseek_models_api') return 'provider_api'
  if (source === 'deepseek_pricing_metadata') return 'provider_docs'
  return source
}

function availabilityBase(input: Readonly<{
  nativeModelId: string
  source: ProviderModelSourceKind
  confidence: ProviderModelAvailability['confidence']
  observedAtMs: number
  warnings?: string[]
}>): Pick<
  ProviderModelAvailability,
  'providerKey' | 'endpointId' | 'profileId' | 'nativeModelId' | 'source' | 'confidence' | 'observedAtMs' | 'warnings' | 'provenance'
> {
  return {
    providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
    endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
    profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
    nativeModelId: input.nativeModelId,
    source: input.source,
    confidence: input.confidence,
    observedAtMs: input.observedAtMs,
    warnings: [...(input.warnings ?? [])],
    provenance: createProviderModelAvailabilityProvenance({
      sourceKind: commonSourceKind(input.source),
      sourceLabel: input.source,
      observedAtMs: input.observedAtMs,
    }),
  }
}

function asObject(value: unknown): ModelRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ModelRecord
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidDeepSeekModelId(value: string): boolean {
  if (value.length > 128) return false
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || DEEPSEEK_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function safeHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'DeepSeek model source credential was rejected.'
  if (status === 429) return 'DeepSeek model source rate limit was reached.'
  return 'DeepSeek model source request failed safely.'
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function modelFromApiRecord(record: ModelRecord, observedAtMs: number): ProviderModelAvailability | null {
  const id = asTrimmedString(record.id)
  if (!id || !isValidDeepSeekModelId(id)) return null

  const object = asTrimmedString(record.object)
  if (object !== 'model') return null

  const ownedBy = asTrimmedString(record.owned_by) ?? undefined
  return {
    ...availabilityBase({
      nativeModelId: id,
      source: 'deepseek_models_api',
      confidence: 'provider_reported',
      observedAtMs,
    }),
    ...(ownedBy ? { ownedBy } : {}),
    ...(ownedBy ? { providerSpecific: { ownedBy } } : {}),
  }
}

export function parseDeepSeekModelsResponse(payload: unknown, observedAtMs: number): ParseResult {
  const root = asObject(payload)
  const data = root?.data
  if (!root || !Array.isArray(data)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'DeepSeek /models response is missing data[].',
      warnings: [],
    }
  }

  const warnings: string[] = []
  const object = asTrimmedString(root.object)
  if (object && object !== 'list') {
    warnings.push('DeepSeek /models response object was not "list"; data[] was parsed conservatively.')
  }

  const models: ProviderModelAvailability[] = []
  data.forEach((item, index) => {
    const record = asObject(item)
    const model = record ? modelFromApiRecord(record, observedAtMs) : null
    if (model) {
      models.push(model)
    } else {
      warnings.push(`Dropped invalid DeepSeek /models item at index ${index}.`)
    }
  })

  return { ok: true, models, warnings }
}

function deepSeekPricingSeed(
  observedAtMs: number,
  values: Readonly<{
    inputCacheHitPer1MTokens: string
    inputCacheMissPer1MTokens: string
    outputPer1MTokens: string
  }>,
): NonNullable<ProviderModelAvailability['pricingSeed']> {
  return {
    inputCacheHitPer1MTokens: values.inputCacheHitPer1MTokens,
    inputCacheMissPer1MTokens: values.inputCacheMissPer1MTokens,
    outputPer1MTokens: values.outputPer1MTokens,
    currency: 'USD',
    source: 'deepseek_pricing_metadata',
    observedAtMs,
  }
}

function sharedDeepSeekV4CapabilitySeed(): NonNullable<ProviderModelAvailability['capabilitySeed']> {
  return {
    textChat: true,
    thinkingMode: 'supported',
    contextLength: 1_000_000,
    maxOutputTokens: 384_000,
    tools: true,
    jsonOutput: true,
    fim: true,
    chatPrefixCompletion: true,
  }
}

function pricingMetadataWarning(): string {
  return 'Model details and pricing are seeded from DeepSeek Models & Pricing docs, not from the /models API.'
}

function aliasWarning(alias: string, mode: 'non-thinking' | 'thinking'): string {
  return `${alias} is a deprecated compatibility alias until ${DEEPSEEK_ALIAS_DEPRECATION_AT_ISO}; use deepseek-v4-flash ${mode} mode instead.`
}

export function getDeepSeekCuratedModelAvailabilitySeeds(observedAtMs: number): ProviderModelAvailability[] {
  const flashPricing = deepSeekPricingSeed(observedAtMs, {
    inputCacheHitPer1MTokens: '0.0028',
    inputCacheMissPer1MTokens: '0.14',
    outputPer1MTokens: '0.28',
  })
  const proPricing = deepSeekPricingSeed(observedAtMs, {
    inputCacheHitPer1MTokens: '0.003625',
    inputCacheMissPer1MTokens: '0.435',
    outputPer1MTokens: '0.87',
  })

  return [
    {
      ...availabilityBase({
        nativeModelId: 'deepseek-v4-flash',
        source: 'deepseek_pricing_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [pricingMetadataWarning()],
      }),
      displayName: 'DeepSeek V4 Flash',
      ownedBy: 'deepseek',
      capabilitySeed: sharedDeepSeekV4CapabilitySeed(),
      pricingSeed: flashPricing,
      providerSpecific: { ownedBy: 'deepseek', pricingSeed: flashPricing },
    },
    {
      ...availabilityBase({
        nativeModelId: 'deepseek-v4-pro',
        source: 'deepseek_pricing_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [pricingMetadataWarning()],
      }),
      displayName: 'DeepSeek V4 Pro',
      ownedBy: 'deepseek',
      capabilitySeed: sharedDeepSeekV4CapabilitySeed(),
      pricingSeed: proPricing,
      providerSpecific: { ownedBy: 'deepseek', pricingSeed: proPricing },
    },
    {
      ...availabilityBase({
        nativeModelId: 'deepseek-chat',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [aliasWarning('deepseek-chat', 'non-thinking'), pricingMetadataWarning()],
      }),
      displayName: 'DeepSeek Chat (deprecated alias)',
      ownedBy: 'deepseek',
      capabilitySeed: {
        ...sharedDeepSeekV4CapabilitySeed(),
        thinkingMode: 'non_thinking_only',
      },
      pricingSeed: flashPricing,
      providerSpecific: {
        ownedBy: 'deepseek',
        pricingSeed: flashPricing,
        alias: {
          deprecated: true,
          deprecationAtIso: DEEPSEEK_ALIAS_DEPRECATION_AT_ISO,
          replacementModelId: 'deepseek-v4-flash',
          mode: 'non-thinking',
        },
      },
    },
    {
      ...availabilityBase({
        nativeModelId: 'deepseek-reasoner',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [aliasWarning('deepseek-reasoner', 'thinking'), pricingMetadataWarning()],
      }),
      displayName: 'DeepSeek Reasoner (deprecated alias)',
      ownedBy: 'deepseek',
      capabilitySeed: {
        ...sharedDeepSeekV4CapabilitySeed(),
        thinkingMode: 'thinking_only',
      },
      pricingSeed: flashPricing,
      providerSpecific: {
        ownedBy: 'deepseek',
        pricingSeed: flashPricing,
        alias: {
          deprecated: true,
          deprecationAtIso: DEEPSEEK_ALIAS_DEPRECATION_AT_ISO,
          replacementModelId: 'deepseek-v4-flash',
          mode: 'thinking',
        },
      },
    },
  ]
}

function mergeAvailability(
  providerReported: ProviderModelAvailability[],
  curated: ProviderModelAvailability[],
): ProviderModelAvailability[] {
  const curatedById = new Map(curated.map((model) => [model.nativeModelId, model]))
  const merged = new Map<string, ProviderModelAvailability>()

  for (const providerModel of providerReported) {
    const seed = curatedById.get(providerModel.nativeModelId)
    merged.set(providerModel.nativeModelId, {
      ...providerModel,
      ...(seed?.displayName ? { displayName: seed.displayName } : {}),
      ...(seed?.ownedBy && !providerModel.ownedBy ? { ownedBy: seed.ownedBy } : {}),
      ...(seed?.capabilitySeed ? { capabilitySeed: seed.capabilitySeed } : {}),
      ...(seed?.pricingSeed ? { pricingSeed: seed.pricingSeed } : {}),
      providerSpecific: {
        ...(providerModel.providerSpecific ?? {}),
        ...(seed?.providerSpecific ?? {}),
        ...(seed?.ownedBy && !providerModel.ownedBy ? { ownedBy: seed.ownedBy } : {}),
        ...(seed?.pricingSeed ? { pricingSeed: seed.pricingSeed } : {}),
      },
      warnings: [
        ...providerModel.warnings,
        ...(seed?.warnings ?? []),
      ],
    })
  }

  for (const seed of curated) {
    if (!merged.has(seed.nativeModelId)) merged.set(seed.nativeModelId, seed)
  }

  return Array.from(merged.values()).sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId))
}

export function resolveDeepSeekModelAvailabilityFromModelsPayload(
  payload: unknown,
  observedAtMs: number,
): DeepSeekModelAvailabilityResult {
  const parsed = parseDeepSeekModelsResponse(payload, observedAtMs)
  if (!parsed.ok) {
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: parsed.code,
      message: parsed.message,
    }
  }

  const curated = getDeepSeekCuratedModelAvailabilitySeeds(observedAtMs)
  const models = mergeAvailability(parsed.models, curated)
  const warnings = [
    ...parsed.warnings,
    'DeepSeek pricing/model details are curated metadata seeds and must be refreshed against official docs before long-lived claims.',
  ]
  return {
    ok: true,
    providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
    endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
    profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
    observedAtMs,
    models,
    warnings,
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}

export async function listDeepSeekProviderModelAvailability(
  input: DeepSeekModelsFetchInput,
): Promise<DeepSeekModelAvailabilityResult> {
  const observedAtMs = input.observedAtMs ?? Date.now()
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: 'credential_missing',
      message: 'DeepSeek API key is not configured.',
    }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  let response: Response
  try {
    response = await input.fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: input.signal ?? undefined,
      redirect: 'error',
    })
  } catch {
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: 'network_error',
      message: 'DeepSeek model source request failed safely.',
    }
  }

  const payload = await readJsonSafely(response)
  if (!response.ok) {
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: 'http_error',
      message: safeHttpErrorMessage(response.status),
      httpStatus: response.status,
    }
  }

  return resolveDeepSeekModelAvailabilityFromModelsPayload(payload, observedAtMs)
}
