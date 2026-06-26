import {
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
  type ProviderModelCapabilitySeed,
  type ProviderModelSourceKind as CommonProviderModelSourceKind,
} from '../modelAvailabilityEnvelope'

export const OPENAI_RESPONSES_PROVIDER_KEY = 'openai_responses' as const
export const OPENAI_RESPONSES_ENDPOINT_ID = 'openai-responses-official' as const
export const OPENAI_RESPONSES_PROFILE_ID = 'openai_responses_v1' as const
export const OPENAI_MODELS_DEFAULT_BASE_URL = 'https://api.openai.com/v1' as const

export const OPENAI_LIST_MODELS_DOC_URL = 'https://platform.openai.com/docs/api-reference/models/list' as const
export const OPENAI_RESPONSES_CREATE_DOC_URL = 'https://platform.openai.com/docs/api-reference/responses/create' as const

export type OpenAIModelSourceKind =
  | 'openai_models_api'
  | 'starverse_curated_metadata'
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
  capabilitySeed?: Readonly<{
    textChat?: boolean
    responsesApi?: boolean
    reasoning?: 'supported' | 'unsupported' | 'unknown'
    reasoningEffort?: ReadonlyArray<'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
    imageInput?: boolean | 'unknown'
    fileInput?: boolean | 'unknown'
    functionCalling?: boolean | 'unknown'
    hostedTools?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
    audioInput?: boolean | 'unknown'
  }> & ProviderModelCapabilitySeed
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
  if (status === 401 || status === 403) return 'OpenAI Responses model source credential was rejected.'
  if (status === 429) return 'OpenAI Responses model source rate limit was reached.'
  return 'OpenAI Responses model source request failed safely.'
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

function modelFromApiRecord(record: ModelRecord, observedAtMs: number): OpenAIProviderModelAvailability | null {
  const id = asTrimmedString(record.id)
  if (!id || !isValidOpenAIModelId(id)) return null

  const object = asTrimmedString(record.object)
  if (object !== 'model') return null

  const ownedBy = asTrimmedString(record.owned_by) ?? undefined
  const createdAtSec = asSafeCreatedAtSec(record.created)
  return {
    ...availabilityBase({
      nativeModelId: id,
      source: 'openai_models_api',
      confidence: 'provider_reported',
      observedAtMs,
    }),
    ...(ownedBy ? { ownedBy } : {}),
    ...(createdAtSec !== undefined ? { createdAtSec } : {}),
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

function curatedWarning(): string {
  return 'OpenAI /models reports availability/basic ownership only; Responses capability hints are Starverse curated metadata.'
}

function responsesTextCapabilitySeed(): NonNullable<OpenAIProviderModelAvailability['capabilitySeed']> {
  return {
    textChat: true,
    responsesApi: true,
    reasoning: 'unknown',
    imageInput: 'unknown',
    fileInput: 'unknown',
    functionCalling: 'unknown',
    hostedTools: 'unknown',
    structuredOutput: 'unknown',
    audioInput: 'unknown',
  }
}

export function getOpenAICuratedModelAvailabilitySeeds(observedAtMs: number): OpenAIProviderModelAvailability[] {
  return [
    {
      ...availabilityBase({
        nativeModelId: 'gpt-4.1',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'GPT-4.1',
      capabilitySeed: responsesTextCapabilitySeed(),
      providerSpecific: {},
    },
    {
      ...availabilityBase({
        nativeModelId: 'gpt-4.1-mini',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'GPT-4.1 mini',
      capabilitySeed: responsesTextCapabilitySeed(),
      providerSpecific: {},
    },
  ]
}

function mergeAvailability(
  providerReported: OpenAIProviderModelAvailability[],
  curated: OpenAIProviderModelAvailability[],
): OpenAIProviderModelAvailability[] {
  const curatedById = new Map(curated.map((model) => [model.nativeModelId, model]))
  const merged = new Map<string, OpenAIProviderModelAvailability>()

  for (const providerModel of providerReported) {
    const seed = curatedById.get(providerModel.nativeModelId)
    merged.set(providerModel.nativeModelId, {
      ...providerModel,
      ...(seed?.displayName ? { displayName: seed.displayName } : {}),
      ...(seed?.capabilitySeed ? { capabilitySeed: seed.capabilitySeed } : {}),
      providerSpecific: {
        ...(providerModel.providerSpecific ?? {}),
        ...(seed?.providerSpecific ?? {}),
      },
      warnings: [
        ...providerModel.warnings,
        ...(seed?.warnings ?? []),
      ],
    })
  }

  return Array.from(merged.values()).sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId))
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
    models: mergeAvailability(parsed.models, getOpenAICuratedModelAvailabilitySeeds(observedAtMs)),
    warnings: [
      ...parsed.warnings,
      'OpenAI /models is treated as availability/basic ownership seed; curated metadata is supplemental and versioned by observedAtMs.',
    ],
    sourceDocuments: sourceDocuments(observedAtMs),
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
  } catch {
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: 'network_error',
      message: 'OpenAI Responses model source request failed safely.',
    }
  }

  const payload = await readJsonSafely(response)
  if (!response.ok) {
    return {
      ok: false,
      providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
      profileId: OPENAI_RESPONSES_PROFILE_ID,
      observedAtMs,
      code: 'http_error',
      message: safeHttpErrorMessage(response.status),
      httpStatus: response.status,
    }
  }

  return resolveOpenAIModelAvailabilityFromModelsPayload(payload, observedAtMs)
}
