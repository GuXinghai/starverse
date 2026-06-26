import {
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
  type ProviderModelCapabilitySeed,
  type ProviderModelSourceKind as CommonProviderModelSourceKind,
} from '../modelAvailabilityEnvelope'

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
  | 'starverse_curated_metadata'
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
  capabilitySeed?: Readonly<{
    textChat?: boolean
    imageInput?: boolean | 'unknown'
    maxInputTokens?: number
    maxOutputTokens?: number
    thinking?: 'supported' | 'unsupported' | 'unknown'
    adaptiveThinking?: boolean | 'unknown'
    toolUse?: boolean | 'unknown'
    files?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
    citations?: boolean | 'unknown'
    capabilitiesRawKeys?: string[]
  }> & ProviderModelCapabilitySeed
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
  message: string
  httpStatus?: number
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

function asSafePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return undefined
  return value
}

function asSafeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
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
  if (status === 401 || status === 403) return 'Anthropic model source credential was rejected.'
  if (status === 429) return 'Anthropic model source rate limit was reached.'
  return 'Anthropic model source request failed safely.'
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

function asValidCreatedAt(value: unknown): string | undefined {
  const raw = asTrimmedString(value)
  if (!raw) return undefined
  return Number.isNaN(Date.parse(raw)) ? undefined : raw
}

function capabilityBoolean(
  capabilities: ModelRecord | null,
  keys: readonly string[],
): boolean | 'unknown' {
  if (!capabilities) return 'unknown'
  for (const key of keys) {
    const value = asSafeBoolean(capabilities[key])
    if (value !== undefined) return value
  }
  return 'unknown'
}

function thinkingCapability(capabilities: ModelRecord | null): 'supported' | 'unsupported' | 'unknown' {
  if (!capabilities) return 'unknown'
  const thinking = asSafeBoolean(capabilities.thinking)
  if (thinking !== undefined) return thinking ? 'supported' : 'unsupported'
  const extendedThinking = asSafeBoolean(capabilities.extended_thinking)
  if (extendedThinking !== undefined) return extendedThinking ? 'supported' : 'unsupported'
  return 'unknown'
}

function rawCapabilityKeys(capabilities: ModelRecord | null): string[] | undefined {
  if (!capabilities) return undefined
  const keys = Object.keys(capabilities)
    .filter((key) => /^[A-Za-z0-9_.:-]{1,80}$/.test(key))
    .sort()
    .slice(0, 30)
  return keys.length > 0 ? keys : undefined
}

function capabilitySeedFromRecord(record: ModelRecord): NonNullable<AnthropicProviderModelAvailability['capabilitySeed']> {
  const capabilities = asObject(record.capabilities)
  const maxInputTokens = asSafePositiveInteger(record.max_input_tokens)
    ?? asSafePositiveInteger(capabilities?.max_input_tokens)
  const maxOutputTokens = asSafePositiveInteger(record.max_tokens)
    ?? asSafePositiveInteger(record.max_output_tokens)
    ?? asSafePositiveInteger(capabilities?.max_tokens)
    ?? asSafePositiveInteger(capabilities?.max_output_tokens)
  const adaptiveThinking = capabilityBoolean(capabilities, ['adaptive_thinking', 'extended_thinking'])

  return {
    textChat: true,
    imageInput: capabilityBoolean(capabilities, ['vision', 'image_input']),
    ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    thinking: thinkingCapability(capabilities),
    adaptiveThinking,
    toolUse: capabilityBoolean(capabilities, ['tool_use', 'tools']),
    files: capabilityBoolean(capabilities, ['files', 'file_input']),
    structuredOutput: capabilityBoolean(capabilities, ['structured_output', 'json_schema']),
    citations: capabilityBoolean(capabilities, ['citations']),
    ...(rawCapabilityKeys(capabilities) ? { capabilitiesRawKeys: rawCapabilityKeys(capabilities) } : {}),
  }
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
    capabilitySeed: capabilitySeedFromRecord(record),
    providerSpecific: {
      ...(createdAt ? { createdAt } : {}),
      modelType,
      ...(capabilitySeedFromRecord(record).capabilitiesRawKeys ? { capabilitiesRawKeys: capabilitySeedFromRecord(record).capabilitiesRawKeys } : {}),
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

function curatedWarning(): string {
  return 'Anthropic Models API is the provider-reported source; Starverse curated metadata is supplemental and does not enable live capabilities.'
}

function curatedCapabilitySeed(input: Readonly<{
  imageInput: boolean | 'unknown'
  thinking: 'supported' | 'unsupported' | 'unknown'
  maxInputTokens?: number
  maxOutputTokens?: number
}>): NonNullable<AnthropicProviderModelAvailability['capabilitySeed']> {
  return {
    textChat: true,
    imageInput: input.imageInput,
    ...(input.maxInputTokens !== undefined ? { maxInputTokens: input.maxInputTokens } : {}),
    ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    thinking: input.thinking,
    adaptiveThinking: input.thinking === 'supported' ? 'unknown' : false,
    toolUse: 'unknown',
    files: 'unknown',
    structuredOutput: 'unknown',
    citations: 'unknown',
  }
}

export function getAnthropicCuratedModelAvailabilitySeeds(observedAtMs: number): AnthropicProviderModelAvailability[] {
  return [
    {
      ...availabilityBase({
        nativeModelId: 'claude-sonnet-4-5',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'Claude Sonnet 4.5',
      capabilitySeed: curatedCapabilitySeed({
        imageInput: true,
        thinking: 'unknown',
        maxInputTokens: 200000,
      }),
      providerSpecific: {},
    },
    {
      ...availabilityBase({
        nativeModelId: 'claude-opus-4-1',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'Claude Opus 4.1',
      capabilitySeed: curatedCapabilitySeed({
        imageInput: true,
        thinking: 'unknown',
        maxInputTokens: 200000,
      }),
      providerSpecific: {},
    },
  ]
}

function mergeAvailability(
  providerReported: AnthropicProviderModelAvailability[],
  curated: AnthropicProviderModelAvailability[],
): AnthropicProviderModelAvailability[] {
  const curatedById = new Map(curated.map((model) => [model.nativeModelId, model]))
  const merged = new Map<string, AnthropicProviderModelAvailability>()

  for (const providerModel of providerReported) {
    const seed = curatedById.get(providerModel.nativeModelId)
    merged.set(providerModel.nativeModelId, {
      ...providerModel,
      ...(providerModel.displayName ? {} : seed?.displayName ? { displayName: seed.displayName } : {}),
      ...(seed?.capabilitySeed ? { capabilitySeed: { ...seed.capabilitySeed, ...providerModel.capabilitySeed } } : {}),
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

  return {
    ok: true,
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
    observedAtMs,
    models: mergeAvailability(parsed.models, getAnthropicCuratedModelAvailabilitySeeds(observedAtMs)),
    warnings: [
      ...parsed.warnings,
      ...(parsed.hasMore ? ['Anthropic Models API response has more pages; use the client pagination path for a fuller snapshot.'] : []),
      'Anthropic Models API is treated as availability and provider-reported capability seed where fields are present; curated metadata is supplemental and versioned by observedAtMs.',
    ],
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
    } catch {
      return {
        ok: false,
        providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
        profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
        observedAtMs,
        code: 'network_error',
        message: 'Anthropic model source request failed safely.',
      }
    }

    const payload = await readJsonSafely(response)
    if (!response.ok) {
      return {
        ok: false,
        providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
        endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
        profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
        observedAtMs,
        code: 'http_error',
        message: safeHttpErrorMessage(response.status),
        httpStatus: response.status,
      }
    }

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

    allModels.push(...parsed.models)
    allWarnings.push(...parsed.warnings)
    if (!parsed.hasMore) break
    if (!parsed.lastId || page === maxPages - 1) {
      truncated = true
      break
    }
    afterId = parsed.lastId
  }

  const models = mergeAvailability(allModels, getAnthropicCuratedModelAvailabilitySeeds(observedAtMs))
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
      'Anthropic Models API is treated as availability and provider-reported capability seed where fields are present; curated metadata is supplemental and versioned by observedAtMs.',
    ],
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}
