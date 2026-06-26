import {
  createProviderModelAvailabilityProvenance,
  type ProviderModelAvailabilityEnvelope,
  type ProviderModelCapabilitySeed,
  type ProviderModelSourceKind as CommonProviderModelSourceKind,
} from '../modelAvailabilityEnvelope'

export const GOOGLE_AI_STUDIO_PROVIDER_KEY = 'google_ai_studio' as const
export const GOOGLE_AI_STUDIO_ENDPOINT_ID = 'google-ai-studio-official' as const
export const GOOGLE_AI_STUDIO_PROFILE_ID = 'gemini_api_v1' as const
export const GEMINI_MODELS_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com' as const

export const GEMINI_MODELS_API_DOC_URL = 'https://ai.google.dev/api/models' as const
export const GEMINI_API_KEY_DOC_URL = 'https://ai.google.dev/gemini-api/docs/api-key' as const

export type GeminiModelSourceKind =
  | 'gemini_models_api'
  | 'starverse_curated_metadata'
  | 'manual_user_model_id'

export type GeminiProviderSpecificModelAvailability = Readonly<{
  providerModelName?: string
  baseModelId?: string
  supportedGenerationMethods?: string[]
  inputTokenLimit?: number
  outputTokenLimit?: number
  nextPageToken?: string
}>

export type GeminiProviderModelAvailability = ProviderModelAvailabilityEnvelope<
  typeof GOOGLE_AI_STUDIO_PROVIDER_KEY,
  typeof GOOGLE_AI_STUDIO_ENDPOINT_ID,
  typeof GOOGLE_AI_STUDIO_PROFILE_ID,
  GeminiProviderSpecificModelAvailability
> & Readonly<{
  source: GeminiModelSourceKind
  confidence: 'provider_reported' | 'curated' | 'manual'
  providerModelName?: string
  displayName?: string
  description?: string
  capabilitySeed?: Readonly<{
    textChat?: boolean
    supportedGenerationMethods?: string[]
    inputTokenLimit?: number
    outputTokenLimit?: number
    thinking?: 'supported' | 'unknown'
    functionCalling?: boolean | 'unknown'
    builtInTools?: boolean | 'unknown'
    vision?: boolean | 'unknown'
    structuredOutput?: boolean | 'unknown'
  }> & ProviderModelCapabilitySeed
}>

export type GeminiModelSourceDocument = Readonly<{
  source: 'gemini_models_api_docs' | 'gemini_api_key_docs'
  url: string
  observedAtMs: number
}>

export type GeminiModelAvailabilitySuccess = Readonly<{
  ok: true
  providerKey: typeof GOOGLE_AI_STUDIO_PROVIDER_KEY
  endpointId: typeof GOOGLE_AI_STUDIO_ENDPOINT_ID
  profileId: typeof GOOGLE_AI_STUDIO_PROFILE_ID
  observedAtMs: number
  models: GeminiProviderModelAvailability[]
  warnings: string[]
  sourceDocuments: GeminiModelSourceDocument[]
}>

export type GeminiModelAvailabilityFailure = Readonly<{
  ok: false
  providerKey: typeof GOOGLE_AI_STUDIO_PROVIDER_KEY
  endpointId: typeof GOOGLE_AI_STUDIO_ENDPOINT_ID
  profileId: typeof GOOGLE_AI_STUDIO_PROFILE_ID
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
  transportCause?: Readonly<{
    name?: string
    code?: string
  }>
}>

export type GeminiModelAvailabilityResult =
  | GeminiModelAvailabilitySuccess
  | GeminiModelAvailabilityFailure

export type GeminiModelsFetchInput = Readonly<{
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
      models: GeminiProviderModelAvailability[]
      warnings: string[]
      nextPageToken?: string
    }>
  | Readonly<{ ok: false; code: 'invalid_response'; message: string; warnings: string[] }>

function sourceDocuments(observedAtMs: number): GeminiModelSourceDocument[] {
  return [
    {
      source: 'gemini_models_api_docs',
      url: GEMINI_MODELS_API_DOC_URL,
      observedAtMs,
    },
    {
      source: 'gemini_api_key_docs',
      url: GEMINI_API_KEY_DOC_URL,
      observedAtMs,
    },
  ]
}

function commonSourceKind(source: GeminiModelSourceKind): CommonProviderModelSourceKind {
  if (source === 'gemini_models_api') return 'provider_api'
  return source
}

function availabilityBase(input: Readonly<{
  nativeModelId: string
  source: GeminiModelSourceKind
  confidence: GeminiProviderModelAvailability['confidence']
  observedAtMs: number
  warnings?: string[]
}>): Pick<
  GeminiProviderModelAvailability,
  'providerKey' | 'endpointId' | 'profileId' | 'nativeModelId' | 'source' | 'confidence' | 'observedAtMs' | 'warnings' | 'provenance'
> {
  return {
    providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
    endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
    profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
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

function asSafeDescription(value: unknown): string | null {
  const text = asTrimmedString(value)
  if (!text) return null
  return text.slice(0, 800)
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return undefined
  return value
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asTrimmedString(item))
    .filter((item): item is string => !!item)
    .slice(0, 64)
}

function isValidGeminiModelId(value: string): boolean {
  if (value.length > 128) return false
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

function normalizeGeminiNativeModelId(record: ModelRecord): string | null {
  const baseModelId = asTrimmedString(record.baseModelId)
  if (baseModelId && isValidGeminiModelId(baseModelId)) return baseModelId

  const name = asTrimmedString(record.name)
  if (!name) return null
  const withoutPrefix = name.startsWith('models/') ? name.slice('models/'.length) : name
  return isValidGeminiModelId(withoutPrefix) ? withoutPrefix : null
}

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || GEMINI_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function safeHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'Google AI Studio model source credential was rejected.'
  if (status === 429) return 'Google AI Studio model source rate limit was reached.'
  return 'Google AI Studio model source request failed safely.'
}

function safeToken(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return /^[A-Za-z0-9_.-]{1,80}$/.test(text) ? text : undefined
}

function safeTransportCause(error: unknown): NonNullable<GeminiModelAvailabilityFailure['transportCause']> | undefined {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const cause = record.cause && typeof record.cause === 'object' ? record.cause as Record<string, unknown> : {}
  const name = safeToken(record.name) ?? safeToken(cause.name)
  const code = safeToken(record.code) ?? safeToken(cause.code)
  if (!name && !code) return undefined
  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
  }
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

function modelFromApiRecord(record: ModelRecord, observedAtMs: number): GeminiProviderModelAvailability | null {
  const nativeModelId = normalizeGeminiNativeModelId(record)
  if (!nativeModelId) return null

  const supportedGenerationMethods = asStringArray(record.supportedGenerationMethods)
  const textChat = supportedGenerationMethods.includes('generateContent') || supportedGenerationMethods.includes('streamGenerateContent')
  const capabilitySeed: NonNullable<GeminiProviderModelAvailability['capabilitySeed']> = {
    textChat,
    supportedGenerationMethods,
    ...(asPositiveInteger(record.inputTokenLimit) ? { inputTokenLimit: asPositiveInteger(record.inputTokenLimit) } : {}),
    ...(asPositiveInteger(record.outputTokenLimit) ? { outputTokenLimit: asPositiveInteger(record.outputTokenLimit) } : {}),
    thinking: 'unknown',
    functionCalling: 'unknown',
    builtInTools: 'unknown',
    vision: 'unknown',
    structuredOutput: 'unknown',
  }

  const providerModelName = asTrimmedString(record.name) ?? undefined
  const baseModelId = asTrimmedString(record.baseModelId) ?? undefined
  const displayName = asTrimmedString(record.displayName) ?? undefined
  const description = asSafeDescription(record.description) ?? undefined

  return {
    ...availabilityBase({
      nativeModelId,
      source: 'gemini_models_api',
      confidence: 'provider_reported',
      observedAtMs,
      warnings: [],
    }),
    ...(providerModelName ? { providerModelName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    capabilitySeed,
    providerSpecific: {
      ...(providerModelName ? { providerModelName } : {}),
      ...(baseModelId ? { baseModelId } : {}),
      ...(supportedGenerationMethods.length > 0 ? { supportedGenerationMethods } : {}),
      ...(capabilitySeed.inputTokenLimit ? { inputTokenLimit: capabilitySeed.inputTokenLimit } : {}),
      ...(capabilitySeed.outputTokenLimit ? { outputTokenLimit: capabilitySeed.outputTokenLimit } : {}),
    },
  }
}

export function parseGeminiModelsResponse(payload: unknown, observedAtMs: number): ParseResult {
  const root = asObject(payload)
  const models = root?.models
  if (!root || !Array.isArray(models)) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Gemini models.list response is missing models[].',
      warnings: [],
    }
  }

  const warnings: string[] = []
  const out: GeminiProviderModelAvailability[] = []
  models.forEach((item, index) => {
    const record = asObject(item)
    const model = record ? modelFromApiRecord(record, observedAtMs) : null
    if (model) {
      out.push(model)
    } else {
      warnings.push(`Dropped invalid Gemini models.list item at index ${index}.`)
    }
  })

  const nextPageToken = asTrimmedString(root.nextPageToken)
  return {
    ok: true,
    models: out,
    warnings,
    ...(nextPageToken ? { nextPageToken } : {}),
  }
}

function curatedWarning(): string {
  return 'Starverse curated Gemini capability hints are supplemental metadata and do not replace provider-reported model availability.'
}

export function getGeminiCuratedModelAvailabilitySeeds(observedAtMs: number): GeminiProviderModelAvailability[] {
  return [
    {
      ...availabilityBase({
        nativeModelId: 'gemini-2.5-flash',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'Gemini 2.5 Flash',
      capabilitySeed: {
        textChat: true,
        thinking: 'supported',
        functionCalling: 'unknown',
        builtInTools: 'unknown',
        vision: 'unknown',
        structuredOutput: 'unknown',
      },
      providerSpecific: {},
    },
    {
      ...availabilityBase({
        nativeModelId: 'gemini-2.5-pro',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs,
        warnings: [curatedWarning()],
      }),
      displayName: 'Gemini 2.5 Pro',
      capabilitySeed: {
        textChat: true,
        thinking: 'supported',
        functionCalling: 'unknown',
        builtInTools: 'unknown',
        vision: 'unknown',
        structuredOutput: 'unknown',
      },
      providerSpecific: {},
    },
  ]
}

function mergeAvailability(
  providerReported: GeminiProviderModelAvailability[],
  curated: GeminiProviderModelAvailability[],
): GeminiProviderModelAvailability[] {
  const curatedById = new Map(curated.map((model) => [model.nativeModelId, model]))
  const merged = new Map<string, GeminiProviderModelAvailability>()

  for (const providerModel of providerReported) {
    const seed = curatedById.get(providerModel.nativeModelId)
    merged.set(providerModel.nativeModelId, {
      ...providerModel,
      ...(providerModel.displayName ? {} : seed?.displayName ? { displayName: seed.displayName } : {}),
      capabilitySeed: {
        ...(seed?.capabilitySeed ?? {}),
        ...(providerModel.capabilitySeed ?? {}),
        thinking: providerModel.capabilitySeed?.thinking === 'unknown'
          ? seed?.capabilitySeed?.thinking ?? 'unknown'
          : providerModel.capabilitySeed?.thinking,
      },
      warnings: [
        ...providerModel.warnings,
        ...(seed?.warnings ?? []),
      ],
      providerSpecific: {
        ...(providerModel.providerSpecific ?? {}),
        ...(seed?.providerSpecific ?? {}),
      },
    })
  }

  return Array.from(merged.values()).sort((a, b) => a.nativeModelId.localeCompare(b.nativeModelId))
}

export function resolveGeminiModelAvailabilityFromModelsPayload(
  payload: unknown,
  observedAtMs: number,
): GeminiModelAvailabilityResult {
  const parsed = parseGeminiModelsResponse(payload, observedAtMs)
  if (!parsed.ok) {
    return {
      ok: false,
      providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
      profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
      observedAtMs,
      code: parsed.code,
      message: parsed.message,
    }
  }

  const warnings = [
    ...parsed.warnings,
    'Gemini models.list is treated as availability and capability seed; curated metadata is supplemental and versioned by observedAtMs.',
  ]
  if (parsed.nextPageToken) {
    warnings.push('Gemini models.list returned nextPageToken; use listGeminiProviderModelAvailability for bounded pagination.')
  }

  return {
    ok: true,
    providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
    endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
    profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
    observedAtMs,
    models: mergeAvailability(parsed.models, getGeminiCuratedModelAvailabilitySeeds(observedAtMs)),
    warnings,
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}

function buildListModelsUrl(input: Readonly<{
  baseUrl: string
  pageToken?: string
}>): string {
  const params = new URLSearchParams({ pageSize: '100' })
  if (input.pageToken) params.set('pageToken', input.pageToken)
  return `${input.baseUrl}/v1beta/models?${params.toString()}`
}

export async function listGeminiProviderModelAvailability(
  input: GeminiModelsFetchInput,
): Promise<GeminiModelAvailabilityResult> {
  const observedAtMs = input.observedAtMs ?? Date.now()
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    return {
      ok: false,
      providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
      profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
      observedAtMs,
      code: 'credential_missing',
      message: 'Google AI Studio API key is not configured.',
    }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const maxPages = Math.min(5, Math.max(1, Math.trunc(input.maxPages ?? 2)))
  const allModels: GeminiProviderModelAvailability[] = []
  const warnings: string[] = []
  let nextPageToken: string | undefined

  for (let page = 0; page < maxPages; page += 1) {
    let response: Response
    try {
      response = await input.fetchImpl(buildListModelsUrl({ baseUrl, pageToken: nextPageToken }), {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
        signal: input.signal ?? undefined,
        redirect: 'error',
      })
    } catch (error) {
      const transportCause = safeTransportCause(error)
      return {
        ok: false,
        providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
        endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
        profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
        observedAtMs,
        code: 'network_error',
        message: 'Google AI Studio model source request failed safely.',
        ...(transportCause ? { transportCause } : {}),
      }
    }

    const payload = await readJsonSafely(response)
    if (!response.ok) {
      return {
        ok: false,
        providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
        endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
        profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
        observedAtMs,
        code: 'http_error',
        message: safeHttpErrorMessage(response.status),
        httpStatus: response.status,
      }
    }

    const parsed = parseGeminiModelsResponse(payload, observedAtMs)
    if (!parsed.ok) {
      return {
        ok: false,
        providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
        endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
        profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
        observedAtMs,
        code: parsed.code,
        message: parsed.message,
      }
    }

    allModels.push(...parsed.models)
    warnings.push(...parsed.warnings)
    nextPageToken = parsed.nextPageToken
    if (!nextPageToken) break
  }

  if (nextPageToken) {
    warnings.push('Gemini models.list pagination was truncated after the bounded R3 page limit.')
  }

  return {
    ok: true,
    providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
    endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
    profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
    observedAtMs,
    models: mergeAvailability(allModels, getGeminiCuratedModelAvailabilitySeeds(observedAtMs)),
    warnings: [
      ...warnings,
      'Gemini models.list is treated as availability and capability seed; curated metadata is supplemental and versioned by observedAtMs.',
    ],
    sourceDocuments: sourceDocuments(observedAtMs),
  }
}
