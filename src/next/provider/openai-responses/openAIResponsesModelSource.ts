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

export const OPENAI_RESPONSES_PROVIDER_KEY = 'openai_responses' as const
export const OPENAI_RESPONSES_ENDPOINT_ID = 'openai-responses-official' as const
export const OPENAI_RESPONSES_PROFILE_ID = 'openai_responses_v1' as const
export const OPENAI_MODELS_DEFAULT_BASE_URL = 'https://api.openai.com/v1' as const

export const OPENAI_LIST_MODELS_DOC_URL = 'https://platform.openai.com/docs/api-reference/models/list' as const
export const OPENAI_RESPONSES_CREATE_DOC_URL = 'https://platform.openai.com/docs/api-reference/responses/create' as const

export type OpenAIModelSourceKind =
  | 'openai_models_api'
  | 'manual_user_model_id'

export type OpenAIProviderSpecificModelAvailability = Readonly<{
  ownedBy?: string
  createdAtSec?: number
  modelsApiRole?: 'availability_basic_ownership_seed'
}>

export type OpenAIProviderModelAvailability = ProviderModelAvailabilityEnvelope<
  typeof OPENAI_RESPONSES_PROVIDER_KEY,
  typeof OPENAI_RESPONSES_ENDPOINT_ID,
  typeof OPENAI_RESPONSES_PROFILE_ID,
  OpenAIProviderSpecificModelAvailability
> & Readonly<{
  source: OpenAIModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  displayName?: string
  ownedBy?: string
  createdAtSec?: number
  observation: CatalogProviderModelObservationV2
}>

export type OpenAIModelSourceDocument = Readonly<{
  source: 'openai_list_models_api_docs' | 'openai_responses_create_docs'
  url: string
  observedAtMs: number
}>

export type OpenAIModelAvailabilitySuccess = Readonly<{
  ok: true
  providerKey: typeof OPENAI_RESPONSES_PROVIDER_KEY
  endpointId: typeof OPENAI_RESPONSES_ENDPOINT_ID
  profileId: typeof OPENAI_RESPONSES_PROFILE_ID
  observedAtMs: number
  models: OpenAIProviderModelAvailability[]
  warnings: string[]
  sourceDocuments: OpenAIModelSourceDocument[]
  rawSourcePayloads: readonly unknown[]
}>

export type OpenAIModelAvailabilityFailure = Readonly<{
  ok: false
  providerKey: typeof OPENAI_RESPONSES_PROVIDER_KEY
  endpointId: typeof OPENAI_RESPONSES_ENDPOINT_ID
  profileId: typeof OPENAI_RESPONSES_PROFILE_ID
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

export type OpenAIModelAvailabilityResult =
  | OpenAIModelAvailabilitySuccess
  | OpenAIModelAvailabilityFailure

export type OpenAIModelsFetchInput = Readonly<{
  apiKey: string
  baseUrl?: string | null
  fetchImpl: typeof fetch
  signal?: AbortSignal | null
  observedAtMs?: number
}>

type ModelRecord = Record<string, unknown>

type ParseResult =
  | Readonly<{ ok: true; models: OpenAIProviderModelAvailability[]; warnings: string[] }>
  | Readonly<{ ok: false; code: 'invalid_response'; message: string; warnings: string[] }>

function sourceDocuments(observedAtMs: number): OpenAIModelSourceDocument[] {
  return [
    {
      source: 'openai_list_models_api_docs',
      url: OPENAI_LIST_MODELS_DOC_URL,
      observedAtMs,
    },
    {
      source: 'openai_responses_create_docs',
      url: OPENAI_RESPONSES_CREATE_DOC_URL,
      observedAtMs,
    },
  ]
}

function commonSourceKind(source: OpenAIModelSourceKind): CommonProviderModelSourceKind {
  if (source === 'openai_models_api') return 'provider_api'
  return source
}

function availabilityBase(input: Readonly<{
  nativeModelId: string
  source: OpenAIModelSourceKind
  confidence: OpenAIProviderModelAvailability['confidence']
  observedAtMs: number
  warnings?: string[]
}>): Pick<
  OpenAIProviderModelAvailability,
  'providerKey' | 'endpointId' | 'profileId' | 'nativeModelId' | 'source' | 'confidence' | 'observedAtMs' | 'warnings' | 'provenance'
> {
  return {
    providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
    endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
    profileId: OPENAI_RESPONSES_PROFILE_ID,
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

function asSafeCreatedAtSec(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
  return value
}

function isValidOpenAIModelId(value: string): boolean {
  if (value.length > 160) return false
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || OPENAI_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function safeHttpErrorMessage(status: number): string {
  if (status === 401) return 'OpenAI Responses model source credential was rejected.'
  if (status === 403) return 'OpenAI Responses model source access was forbidden.'
  if (status === 404) return 'OpenAI Responses model source endpoint or model list was not found.'
  if (status === 429) return 'OpenAI Responses model source rate limit was reached.'
  return `OpenAI Responses model source returned HTTP ${status}.`
}

function modelFromApiRecord(record: ModelRecord, observedAtMs: number): OpenAIProviderModelAvailability | null {
  const id = asTrimmedString(record.id)
  if (!id || !isValidOpenAIModelId(id)) return null

  const object = asTrimmedString(record.object)
  if (object !== 'model') return null

  const ownedBy = asTrimmedString(record.owned_by) ?? undefined
  const createdAtSec = asSafeCreatedAtSec(record.created)
  const missingFact = (path: string) => missingProviderBooleanFactV2(path)
  const observation: CatalogProviderModelObservationV2 = {
    schemaVersion: 2,
    providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
    endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
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
    provenance: { sourceKind: 'provider_api', sourceLabel: 'openai_models_api', observedAtMs, parserVersion: 2 },
  }
  return {
    ...availabilityBase({
      nativeModelId: id,
      source: 'openai_models_api',
      confidence: 'provider_reported',
      observedAtMs,
    }),
    ...(ownedBy ? { ownedBy } : {}),
    ...(createdAtSec !== undefined ? { createdAtSec } : {}),
    observation,
    providerSpecific: {
      ...(ownedBy ? { ownedBy } : {}),
      ...(createdAtSec !== undefined ? { createdAtSec } : {}),
      modelsApiRole: 'availability_basic_ownership_seed',
    },
  }
}

export function parseOpenAIModelsResponse(payload: unknown, observedAtMs: number): ParseResult {
  const root = asObject(payload)
  const data = root?.data
  if (!root || !Array.isArray(data)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'OpenAI /models response is missing data[].',
      warnings: [],
    }
  }

  const warnings: string[] = []
  const object = asTrimmedString(root.object)
  if (object && object !== 'list') {
    warnings.push('OpenAI /models response object was not "list"; data[] was parsed conservatively.')
  }

  const models: OpenAIProviderModelAvailability[] = []
  data.forEach((item, index) => {
    const record = asObject(item)
    const model = record ? modelFromApiRecord(record, observedAtMs) : null
    if (model) {
      models.push(model)
    } else {
      warnings.push(`Dropped invalid OpenAI /models item at index ${index}.`)
    }
  })

  return { ok: true, models, warnings }
}

export function resolveOpenAIModelAvailabilityFromModelsPayload(
  payload: unknown,
  observedAtMs: number,
): OpenAIModelAvailabilityResult {
  const parsed = parseOpenAIModelsResponse(payload, observedAtMs)
  if (!parsed.ok) {
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: parsed.code,
      message: parsed.message,
    }
  }

  return {
    ok: true,
    providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
    endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
    profileId: OPENAI_RESPONSES_PROFILE_ID,
    observedAtMs,
    models: [...parsed.models].sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId)),
    warnings: parsed.warnings,
    sourceDocuments: sourceDocuments(observedAtMs),
    rawSourcePayloads: [payload],
  }
}

export async function listOpenAIProviderModelAvailability(
  input: OpenAIModelsFetchInput,
): Promise<OpenAIModelAvailabilityResult> {
  const observedAtMs = input.observedAtMs ?? Date.now()
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: 'credential_missing',
      message: 'OpenAI Responses API key is not configured.',
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
      providerId: OPENAI_RESPONSES_PROVIDER_KEY,
      transportKind: 'electron_session_fetch',
      error,
      abortReason: input.signal?.aborted ? input.signal.reason ?? 'aborted' : undefined,
    })
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: 'network_error',
      message: providerNetworkFailureMessage('OpenAI Responses model source', networkError),
      networkError,
      providerFailure: providerModelTransportFailureV2({ providerId: OPENAI_RESPONSES_PROVIDER_KEY,
        contractId: 'openai-models-v1', observedAtMs, requestSequence: 1, error, credential: apiKey }),
    }
  }

  const body = await readProviderModelResponseBodyV2(response)
  if (!response.ok) {
    const networkError = buildNetworkErrorEnvelope({
      requestPurpose: 'provider_availability',
      providerId: OPENAI_RESPONSES_PROVIDER_KEY,
      transportKind: 'electron_session_fetch',
      httpStatus: response.status,
    })
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: 'http_error',
      message: safeHttpErrorMessage(response.status),
      httpStatus: response.status,
      networkError,
      providerFailure: providerModelHttpFailureV2({ providerId: OPENAI_RESPONSES_PROVIDER_KEY,
        contractId: 'openai-models-v1', observedAtMs, requestSequence: 1, response, body }),
    }
  }

  return resolveOpenAIModelAvailabilityFromModelsPayload(body.payload, observedAtMs)
}
