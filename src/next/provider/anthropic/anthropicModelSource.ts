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
  providerBooleanFactV2,
  type CatalogProviderModelObservationV2,
  type ProviderReportedFactV2,
} from '../../../shared/modelCatalog/providerModelObservationV2'
import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import {
  providerModelHttpFailureV2,
  providerModelTransportFailureV2,
  readProviderModelResponseBodyV2,
} from '../modelCatalogFailureV2'

export const ANTHROPIC_MESSAGES_PROVIDER_KEY = 'anthropic_messages' as const
export const ANTHROPIC_MESSAGES_ENDPOINT_ID = 'anthropic-official' as const
export const ANTHROPIC_MESSAGES_PROFILE_ID = 'anthropic_messages_v1' as const
export const ANTHROPIC_MODELS_DEFAULT_BASE_URL = 'https://api.anthropic.com/v1' as const
export const ANTHROPIC_MODELS_API_VERSION = '2023-06-01' as const

export const ANTHROPIC_LIST_MODELS_DOC_URL = 'https://platform.claude.com/docs/en/api/models/list' as const
export const ANTHROPIC_MESSAGES_API_DOC_URL = 'https://platform.claude.com/docs/en/api/messages' as const
export const ANTHROPIC_MODELS_OVERVIEW_DOC_URL = 'https://docs.anthropic.com/en/docs/about-claude/models/overview' as const

export type AnthropicModelSourceKind =
  | 'anthropic_models_api'
  | 'manual_user_model_id'

export type AnthropicProviderSpecificModelAvailability = Readonly<{
  createdAt?: string
  modelType?: string
  pagination?: Readonly<{
    hasMore: boolean
    lastId?: string
    truncated?: boolean
  }>
  capabilitiesRawKeys?: string[]
}>

export type AnthropicProviderModelAvailability = ProviderModelAvailabilityEnvelope<
  typeof ANTHROPIC_MESSAGES_PROVIDER_KEY,
  typeof ANTHROPIC_MESSAGES_ENDPOINT_ID,
  typeof ANTHROPIC_MESSAGES_PROFILE_ID,
  AnthropicProviderSpecificModelAvailability
> & Readonly<{
  source: AnthropicModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  displayName?: string
  createdAt?: string
  modelType?: string
  observation?: CatalogProviderModelObservationV2
}>

export type AnthropicModelSourceDocument = Readonly<{
  source: 'anthropic_list_models_api_docs' | 'anthropic_messages_api_docs' | 'anthropic_models_overview_docs'
  url: string
  observedAtMs: number
}>

export type AnthropicModelAvailabilitySuccess = Readonly<{
  ok: true
  providerKey: typeof ANTHROPIC_MESSAGES_PROVIDER_KEY
  endpointId: typeof ANTHROPIC_MESSAGES_ENDPOINT_ID
  profileId: typeof ANTHROPIC_MESSAGES_PROFILE_ID
  observedAtMs: number
  models: AnthropicProviderModelAvailability[]
  warnings: string[]
  sourceDocuments: AnthropicModelSourceDocument[]
}>

export type AnthropicModelAvailabilityFailure = Readonly<{
  ok: false
  providerKey: typeof ANTHROPIC_MESSAGES_PROVIDER_KEY
  endpointId: typeof ANTHROPIC_MESSAGES_ENDPOINT_ID
  profileId: typeof ANTHROPIC_MESSAGES_PROFILE_ID
  observedAtMs: number
  code:
    | 'credential_missing'
    | 'store_unavailable'
    | 'invalid_payload'
    | 'invalid_response'
    | 'http_error'
    | 'network_error'
    | 'pagination_incomplete'
  message: string
  httpStatus?: number
  networkError?: NetworkErrorEnvelope
  pagesFetched?: number
  nextPageCursor?: string
  providerFailure?: ProviderFailureV2
}>

export type AnthropicModelAvailabilityResult =
  | AnthropicModelAvailabilitySuccess
  | AnthropicModelAvailabilityFailure

export type AnthropicModelsFetchInput = Readonly<{
  apiKey: string
  baseUrl?: string | null
  fetchImpl: typeof fetch
  signal?: AbortSignal | null
  observedAtMs?: number
  maxPages?: number
}>

type ModelRecord = Record<string, unknown>

type ParseResult =
  | Readonly<{
      ok: true
      models: AnthropicProviderModelAvailability[]
      warnings: string[]
      hasMore: boolean
      lastId?: string
    }>
  | Readonly<{ ok: false; code: 'invalid_response'; message: string; warnings: string[] }>

function sourceDocuments(observedAtMs: number): AnthropicModelSourceDocument[] {
  return [
    {
      source: 'anthropic_list_models_api_docs',
      url: ANTHROPIC_LIST_MODELS_DOC_URL,
      observedAtMs,
    },
    {
      source: 'anthropic_messages_api_docs',
      url: ANTHROPIC_MESSAGES_API_DOC_URL,
      observedAtMs,
    },
    {
      source: 'anthropic_models_overview_docs',
      url: ANTHROPIC_MODELS_OVERVIEW_DOC_URL,
      observedAtMs,
    },
  ]
}

function commonSourceKind(source: AnthropicModelSourceKind): CommonProviderModelSourceKind {
  if (source === 'anthropic_models_api') return 'provider_api'
  return source
}

function availabilityBase(input: Readonly<{
  nativeModelId: string
  source: AnthropicModelSourceKind
  confidence: AnthropicProviderModelAvailability['confidence']
  observedAtMs: number
  warnings?: string[]
}>): Pick<
  AnthropicProviderModelAvailability,
  'providerKey' | 'endpointId' | 'profileId' | 'nativeModelId' | 'source' | 'confidence' | 'observedAtMs' | 'warnings' | 'provenance'
> {
  return {
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
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

function isValidAnthropicModelId(value: string): boolean {
  if (value.length > 180) return false
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || ANTHROPIC_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function safeHttpErrorMessage(status: number): string {
  if (status === 401) return 'Anthropic model source credential was rejected.'
  if (status === 403) return 'Anthropic model source access was forbidden.'
  if (status === 404) return 'Anthropic model source endpoint or model list was not found.'
  if (status === 429) return 'Anthropic model source rate limit was reached.'
  return `Anthropic model source returned HTTP ${status}.`
}

function asValidCreatedAt(value: unknown): string | undefined {
  const raw = asTrimmedString(value)
  if (!raw) return undefined
  return Number.isNaN(Date.parse(raw)) ? undefined : raw
}

function firstProviderBooleanFact(
  owner: ModelRecord | null,
  keys: readonly string[],
  pathPrefix: string,
): ProviderReportedFactV2<boolean> {
  for (const key of keys) {
    if (owner && Object.prototype.hasOwnProperty.call(owner, key)) {
      const nested = asObject(owner[key])
      if (nested && typeof nested.supported === 'boolean') {
        return {
          providerPath: `${pathPrefix}.${key}.supported`,
          ownProperty: true,
          presence: 'present',
          value: nested.supported,
          rawValue: nested.supported,
        }
      }
      return providerBooleanFactV2({ owner, key, providerPath: `${pathPrefix}.${key}` })
    }
  }
  return missingProviderBooleanFactV2(`${pathPrefix}.${keys[0]}`)
}

function modelFromApiRecord(
  record: ModelRecord,
  observedAtMs: number,
  warnings: string[],
  index: number,
): AnthropicProviderModelAvailability | null {
  const id = asTrimmedString(record.id)
  if (!id || !isValidAnthropicModelId(id)) return null

  const modelType = asTrimmedString(record.type)
  if (modelType !== 'model') return null

  const createdAt = asValidCreatedAt(record.created_at)
  if (record.created_at !== undefined && !createdAt) {
    warnings.push(`Omitted invalid Anthropic created_at for ${id} at index ${index}.`)
  }

  const displayName = asTrimmedString(record.display_name) ?? undefined
  const capabilities = asObject(record.capabilities)
  const observation: CatalogProviderModelObservationV2 = {
    schemaVersion: 2,
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    nativeModelId: id,
    observedAtMs,
    rawProviderRecord: preserveProviderRecordV2(record),
    facts: {
      textChat: missingProviderBooleanFactV2('data[].text_chat'),
      reasoning: firstProviderBooleanFact(capabilities, ['thinking', 'extended_thinking'], 'data[].capabilities'),
      tools: firstProviderBooleanFact(capabilities, ['tool_use', 'tools'], 'data[].capabilities'),
      structuredOutputs: firstProviderBooleanFact(capabilities, ['structured_outputs', 'structured_output', 'json_schema'], 'data[].capabilities'),
      vision: firstProviderBooleanFact(capabilities, ['vision', 'image_input'], 'data[].capabilities'),
    },
    provenance: { sourceKind: 'provider_api', sourceLabel: 'anthropic_models_api', observedAtMs, parserVersion: 2 },
  }
  return {
    ...availabilityBase({
      nativeModelId: id,
      source: 'anthropic_models_api',
      confidence: 'provider_reported',
      observedAtMs,
    }),
    ...(displayName ? { displayName } : {}),
    ...(createdAt ? { createdAt } : {}),
    modelType,
    observation,
    providerSpecific: {
      ...(createdAt ? { createdAt } : {}),
      modelType,
      ...(capabilities ? { capabilitiesRawKeys: Object.keys(capabilities).sort() } : {}),
    },
  }
}

export function parseAnthropicModelsResponse(payload: unknown, observedAtMs: number): ParseResult {
  const root = asObject(payload)
  const data = root?.data
  if (!root || !Array.isArray(data)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Anthropic Models API response is missing data[].',
      warnings: [],
    }
  }

  const warnings: string[] = []
  const models: AnthropicProviderModelAvailability[] = []
  data.forEach((item, index) => {
    const record = asObject(item)
    const model = record ? modelFromApiRecord(record, observedAtMs, warnings, index) : null
    if (model) {
      models.push(model)
    } else {
      warnings.push(`Dropped invalid Anthropic Models API item at index ${index}.`)
    }
  })

  const hasMore = root.has_more === true
  const lastId = asTrimmedString(root.last_id) ?? undefined
  const modelsWithPagination = models.map((model) => ({
    ...model,
    providerSpecific: {
      ...(model.providerSpecific ?? {}),
      pagination: {
        hasMore,
        ...(lastId ? { lastId } : {}),
      },
    },
  }))
  return {
    ok: true,
    models: modelsWithPagination,
    warnings,
    hasMore,
    ...(lastId ? { lastId } : {}),
  }
}

export function resolveAnthropicModelAvailabilityFromModelsPayload(
  payload: unknown,
  observedAtMs: number,
): AnthropicModelAvailabilityResult {
  const parsed = parseAnthropicModelsResponse(payload, observedAtMs)
  if (!parsed.ok) {
    return {
      ok: false,
      providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
      profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
      observedAtMs,
      code: parsed.code,
      message: parsed.message,
    }
  }

  if (parsed.hasMore) {
    return {
      ok: false,
      providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
      profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
      observedAtMs,
      code: 'pagination_incomplete',
      message: 'Anthropic Models API response is incomplete because more pages are available.',
      pagesFetched: 1,
      ...(parsed.lastId ? { nextPageCursor: parsed.lastId } : {}),
    }
  }

  return {
    ok: true,
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
    observedAtMs,
    models: [...parsed.models].sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId)),
    warnings: parsed.warnings,
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}

export async function listAnthropicProviderModelAvailability(
  input: AnthropicModelsFetchInput,
): Promise<AnthropicModelAvailabilityResult> {
  const observedAtMs = input.observedAtMs ?? Date.now()
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    return {
      ok: false,
      providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
      profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
      observedAtMs,
      code: 'credential_missing',
      message: 'Anthropic API key is not configured.',
    }
  }

  const maxPages = Math.min(10, Math.max(1, Math.trunc(input.maxPages ?? 5)))
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const allModels: AnthropicProviderModelAvailability[] = []
  const allWarnings: string[] = []
  let afterId: string | undefined
  let truncated = false

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${baseUrl}/models`)
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)

    let response: Response
    try {
      response = await input.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_MODELS_API_VERSION,
        },
        signal: input.signal ?? undefined,
        redirect: 'error',
      })
    } catch (error) {
      const networkError = buildNetworkErrorEnvelope({
        requestPurpose: 'provider_availability',
        providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        transportKind: 'electron_session_fetch',
        error,
        abortReason: input.signal?.aborted ? input.signal.reason ?? 'aborted' : undefined,
      })
      return {
        ok: false,
        providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
        profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
        observedAtMs,
        code: 'network_error',
        message: providerNetworkFailureMessage('Anthropic model source', networkError),
        networkError,
        providerFailure: providerModelTransportFailureV2({ providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY,
          contractId: 'anthropic-models-v1', observedAtMs, requestSequence: page + 1, error, credential: apiKey }),
      }
    }

    const body = await readProviderModelResponseBodyV2(response)
    if (!response.ok) {
      const networkError = buildNetworkErrorEnvelope({
        requestPurpose: 'provider_availability',
        providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        transportKind: 'electron_session_fetch',
        httpStatus: response.status,
      })
      return {
        ok: false,
        providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
        profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
        observedAtMs,
        code: 'http_error',
        message: safeHttpErrorMessage(response.status),
        httpStatus: response.status,
        networkError,
        providerFailure: providerModelHttpFailureV2({ providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY,
          contractId: 'anthropic-models-v1', observedAtMs, requestSequence: page + 1, response, body }),
      }
    }

    const parsed = parseAnthropicModelsResponse(body.payload, observedAtMs)
    if (!parsed.ok) {
      return {
        ok: false,
        providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
        profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
        observedAtMs,
        code: parsed.code,
        message: parsed.message,
      }
    }

    allModels.push(...parsed.models)
    allWarnings.push(...parsed.warnings)
    if (!parsed.hasMore) break
    if (!parsed.lastId) {
      truncated = true
      break
    }
    afterId = parsed.lastId
    if (page === maxPages - 1) {
      truncated = true
      break
    }
  }

  if (truncated) {
    return {
      ok: false,
      providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
      profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
      observedAtMs,
      code: 'pagination_incomplete',
      message: 'Anthropic Models API pagination exceeded the configured page bound.',
      pagesFetched: maxPages,
      ...(afterId ? { nextPageCursor: afterId } : {}),
    }
  }

  const models = [...allModels].sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId))
    .map((model) => ({
      ...model,
      providerSpecific: {
        ...(model.providerSpecific ?? {}),
        ...(truncated
          ? {
              pagination: {
                ...(model.providerSpecific?.pagination ?? { hasMore: true }),
                truncated: true,
              },
            }
          : {}),
      },
    }))

  return {
    ok: true,
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
    observedAtMs,
    models,
    warnings: [
      ...allWarnings,
      ...(truncated ? ['Anthropic models pagination was truncated after the bounded R5 page limit.'] : []),
    ],
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}
