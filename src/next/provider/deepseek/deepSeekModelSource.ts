import {
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
  type ProviderModelSourceKind as CommonProviderModelSourceKind,
} from '../modelAvailabilityEnvelope'
import {
  buildNetworkErrorEnvelope,
  providerNetworkFailureMessage,
  type NetworkErrorEnvelope,
} from '../../../shared/network/networkErrorEnvelope'
import {
  missingProviderBooleanFactV2,
  preserveProviderRecordV2,
  type CatalogProviderModelObservationV2,
} from '../../../shared/modelCatalog/providerModelObservationV2'
import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import {
  providerModelHttpFailureV2,
  providerModelTransportFailureV2,
  readProviderModelResponseBodyV2,
} from '../modelCatalogFailureV2'

export const DEEPSEEK_OFFICIAL_PROVIDER_KEY = 'deepseek' as const
export const DEEPSEEK_OFFICIAL_ENDPOINT_ID = 'deepseek-official' as const
export const DEEPSEEK_OFFICIAL_PROFILE_ID = 'deepseek_official_openai_compat' as const
export const DEEPSEEK_MODELS_DEFAULT_BASE_URL = 'https://api.deepseek.com' as const

export const DEEPSEEK_LIST_MODELS_DOC_URL = 'https://api-docs.deepseek.com/api/list-models' as const
export const DEEPSEEK_MODELS_PRICING_DOC_URL = 'https://api-docs.deepseek.com/quick_start/pricing' as const
export const DEEPSEEK_API_INTRO_DOC_URL = 'https://api-docs.deepseek.com/api/deepseek-api' as const
export const DEEPSEEK_THINKING_MODE_DOC_URL = 'https://api-docs.deepseek.com/guides/thinking_mode/' as const
export const DEEPSEEK_TOOL_CALLS_DOC_URL = 'https://api-docs.deepseek.com/guides/tool_calls/' as const
export const DEEPSEEK_JSON_OUTPUT_DOC_URL = 'https://api-docs.deepseek.com/guides/json_mode/' as const
export const DEEPSEEK_ALIAS_DEPRECATION_AT_ISO = '2026-07-24T15:59:00.000Z' as const

export type ProviderModelSourceKind =
  | 'deepseek_models_api'
  | 'deepseek_pricing_metadata'
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
  observation?: CatalogProviderModelObservationV2
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
    | 'deepseek_thinking_mode_docs'
    | 'deepseek_tool_calls_docs'
    | 'deepseek_json_output_docs'
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
  networkError?: NetworkErrorEnvelope
  providerFailure?: ProviderFailureV2
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
    {
      source: 'deepseek_thinking_mode_docs',
      url: DEEPSEEK_THINKING_MODE_DOC_URL,
      observedAtMs,
    },
    {
      source: 'deepseek_tool_calls_docs',
      url: DEEPSEEK_TOOL_CALLS_DOC_URL,
      observedAtMs,
    },
    {
      source: 'deepseek_json_output_docs',
      url: DEEPSEEK_JSON_OUTPUT_DOC_URL,
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
  if (status === 401) return 'DeepSeek model source credential was rejected.'
  if (status === 403) return 'DeepSeek model source access was forbidden.'
  if (status === 404) return 'DeepSeek model source endpoint or model list was not found.'
  if (status === 429) return 'DeepSeek model source rate limit was reached.'
  return `DeepSeek model source returned HTTP ${status}.`
}

function modelFromApiRecord(record: ModelRecord, observedAtMs: number): ProviderModelAvailability | null {
  const id = asTrimmedString(record.id)
  if (!id || !isValidDeepSeekModelId(id)) return null

  const object = asTrimmedString(record.object)
  if (object !== 'model') return null

  const ownedBy = asTrimmedString(record.owned_by) ?? undefined
  const missingFact = (path: string) => missingProviderBooleanFactV2(path)
  const observation: CatalogProviderModelObservationV2 = {
    schemaVersion: 2,
    providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
    endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
    nativeModelId: id,
    observedAtMs,
    rawProviderRecord: preserveProviderRecordV2(record),
    facts: {
      textChat: missingFact('data[].text_chat'),
      reasoning: missingFact('data[].reasoning'),
      tools: missingFact('data[].tools'),
      structuredOutputs: missingFact('data[].structured_outputs'),
      vision: missingFact('data[].vision'),
    },
    provenance: { sourceKind: 'provider_api', sourceLabel: 'deepseek_models_api', observedAtMs, parserVersion: 2 },
  }
  return {
    ...availabilityBase({
      nativeModelId: id,
      source: 'deepseek_models_api',
      confidence: 'provider_reported',
      observedAtMs,
    }),
    ...(ownedBy ? { ownedBy } : {}),
    observation,
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

  const models = [...parsed.models].sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId))
  const warnings = parsed.warnings
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
  } catch (error) {
    const networkError = buildNetworkErrorEnvelope({
      requestPurpose: 'provider_availability',
      providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      transportKind: 'electron_session_fetch',
      error,
      abortReason: input.signal?.aborted ? input.signal.reason ?? 'aborted' : undefined,
    })
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: 'network_error',
      message: providerNetworkFailureMessage('DeepSeek model source', networkError),
      networkError,
      providerFailure: providerModelTransportFailureV2({ providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
        contractId: 'deepseek-models-v1', observedAtMs, requestSequence: 1, error, credential: apiKey }),
    }
  }

  const body = await readProviderModelResponseBodyV2(response)
  if (!response.ok) {
    const networkError = buildNetworkErrorEnvelope({
      requestPurpose: 'provider_availability',
      providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      transportKind: 'electron_session_fetch',
      httpStatus: response.status,
    })
    return {
      ok: false,
      providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
      profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
      observedAtMs,
      code: 'http_error',
      message: safeHttpErrorMessage(response.status),
      httpStatus: response.status,
      networkError,
      providerFailure: providerModelHttpFailureV2({ providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
        contractId: 'deepseek-models-v1', observedAtMs, requestSequence: 1, response, body }),
    }
  }

  return resolveDeepSeekModelAvailabilityFromModelsPayload(body.payload, observedAtMs)
}
