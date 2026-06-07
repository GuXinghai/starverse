import { PROVIDERS } from '../../constants/providers'
import {
  buildModelKey,
  type AdapterGetModelEndpointsInput,
  type AdapterListModelsInput,
  type AdapterListModelsResult,
  type AdapterListProvidersInput,
  type CatalogEndpointMetric,
  type CatalogModel,
  type CatalogModelEndpoint,
  type CatalogModelEndpoints,
  type CatalogModelCapabilities,
  type CatalogModality,
  type CatalogPricing,
  type CatalogProvider,
  type CatalogRawEnvelope,
  type JsonValue,
  type ProviderAdapter,
} from './internalSchema'
import { deriveModelTags } from './modelTagger'

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_ATTRIBUTION_REFERER = 'https://github.com/GuXinghai/starverse'
const OPENROUTER_ATTRIBUTION_TITLE = 'Starverse'
const OPENROUTER_RAW_SCHEMA_VERSION = 1
const OPENROUTER_LONG_CONTEXT_THRESHOLD = 128_000

type OpenRouterModelObject = Record<string, unknown>
type OpenRouterProviderObject = Record<string, unknown>

type OpenRouterFetchContext = Readonly<{
  apiKey: string
  baseUrl: string
  signal?: AbortSignal | null
}>

type OpenRouterModelsSource = 'models' | 'models_user'

type OpenRouterFetchOptions = Readonly<{
  fetchImpl?: typeof fetch
  httpReferer?: string
  xTitle?: string
}>

export type OpenRouterModelsCountResult = Readonly<{
  count: number
  fetchedAtMs: number
}>

type OpenRouterHttpError = Readonly<{
  status: number
  statusText: string
  message: string
  code?: number | null
  retryAfter?: string | null
}>

function normalizeBaseUrl(baseUrl: string): string {
  const raw = baseUrl.trim()
  if (!raw) return OPENROUTER_DEFAULT_BASE_URL
  return raw.replace(/\/+$/, '')
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asUnixSeconds(value: unknown): number | null {
  const numeric = asNumber(value)
  if (numeric == null) return null
  return Math.trunc(numeric)
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asString(item))
    .filter((item): item is string => typeof item === 'string')
}

function toJsonValue(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue
  } catch {
    return { value: String(value) } as JsonValue
  }
}

function buildRawEnvelope(
  source: 'models' | 'models_user' | 'providers',
  fetchedAtMs: number,
  baseUrl: string,
  payload: unknown
): CatalogRawEnvelope {
  return {
    schemaVersion: OPENROUTER_RAW_SCHEMA_VERSION,
    buckets: [
      {
        source,
        fetchedAtMs,
        baseUrl,
        payload: toJsonValue(payload),
      },
    ],
  }
}

function normalizeModality(value: unknown): CatalogModality | null {
  const raw = asString(value)?.toLowerCase()
  if (!raw) return null
  if (raw.includes('image')) return 'image'
  if (raw.includes('audio')) return 'audio'
  if (raw.includes('video')) return 'video'
  if (raw.includes('file') || raw.includes('document')) return 'file'
  if (raw.includes('text')) return 'text'
  return null
}

function dedupeModalities(modalities: CatalogModality[]): CatalogModality[] {
  return Array.from(new Set(modalities))
}

function resolveModalities(raw: OpenRouterModelObject): Readonly<{
  architectureModality: string | null
  inputModalities: CatalogModality[]
  outputModalities: CatalogModality[]
}> {
  const architecture = asObject(raw.architecture)
  const inputFromArray = asStringArray(architecture?.input_modalities).map(normalizeModality).filter(Boolean) as CatalogModality[]
  const outputFromArray = asStringArray(architecture?.output_modalities).map(normalizeModality).filter(Boolean) as CatalogModality[]
  const architectureModality = asString(architecture?.modality)?.toLowerCase() ?? null

  const inputModalities = dedupeModalities(inputFromArray)
  const outputModalities = dedupeModalities(outputFromArray)

  if (inputModalities.length === 0 || outputModalities.length === 0) {
    const parts = architectureModality?.split('->').map((part) => normalizeModality(part)) ?? []
    if (inputModalities.length === 0 && parts[0]) inputModalities.push(parts[0])
    if (outputModalities.length === 0 && parts[1]) outputModalities.push(parts[1])
  }

  if (inputModalities.length === 0) inputModalities.push('text')
  if (outputModalities.length === 0) outputModalities.push('text')

  return { architectureModality, inputModalities, outputModalities }
}

function resolveCapabilities(
  supportedParameters: string[],
  modalities: Readonly<{ inputModalities: CatalogModality[] }>,
  contextLength: number | null
): CatalogModelCapabilities {
  const parameterSet = new Set(supportedParameters.map((parameter) => parameter.toLowerCase()))
  const hasVisionInput = modalities.inputModalities.includes('image') || modalities.inputModalities.includes('video')

  return {
    reasoning: parameterSet.has('reasoning') || parameterSet.has('include_reasoning'),
    tools: parameterSet.has('tools') || parameterSet.has('tool_choice'),
    structuredOutputs:
      parameterSet.has('response_format') ||
      parameterSet.has('json_schema') ||
      parameterSet.has('structured_outputs'),
    vision: hasVisionInput,
    longContext: typeof contextLength === 'number' && contextLength >= OPENROUTER_LONG_CONTEXT_THRESHOLD,
  }
}

function resolvePricing(raw: OpenRouterModelObject): CatalogPricing | null {
  const pricing = asObject(raw.pricing)
  if (!pricing) return null

  const value: CatalogPricing = {
    prompt: asString(pricing.prompt),
    completion: asString(pricing.completion),
    request: asString(pricing.request),
    image: asString(pricing.image),
    webSearch: asString(pricing.web_search),
    internalReasoning: asString(pricing.internal_reasoning),
    inputCacheRead: asString(pricing.input_cache_read),
    inputCacheWrite: asString(pricing.input_cache_write),
  }

  return Object.values(value).some((item) => item != null) ? value : null
}

function resolveModelStatus(expirationDate: string | null): 'active' | 'archived' {
  if (!expirationDate) return 'active'
  const expiresAt = Date.parse(expirationDate)
  if (!Number.isFinite(expiresAt)) return 'active'
  return expiresAt < Date.now() ? 'archived' : 'active'
}

function deriveFamily(modelId: string): string | null {
  const slash = modelId.indexOf('/')
  if (slash < 0 || slash + 1 >= modelId.length) return null
  const slug = modelId.slice(slash + 1)
  const family = slug.split(/[-:.]/)[0]?.trim() ?? ''
  return family.length > 0 ? family : null
}

function deriveVendor(modelId: string): string | null {
  const slash = modelId.indexOf('/')
  if (slash <= 0) return null
  const vendor = modelId.slice(0, slash).trim()
  return vendor.length > 0 ? vendor : null
}

function normalizeOpenRouterProviderSlug(rawProvider: OpenRouterProviderObject): string {
  const slug = asString(rawProvider.slug)
  if (slug) return slug.toLowerCase()
  const name = asString(rawProvider.name) ?? 'unknown'
  return name.toLowerCase().replace(/\s+/g, '-')
}

function parseHttpError(response: Response, bodyText: string): OpenRouterHttpError {
  let code: number | null = null
  let message: string | null = null
  try {
    const parsed = JSON.parse(bodyText) as { error?: { code?: unknown; message?: unknown } }
    const errorObj = asObject(parsed?.error)
    const parsedCode = asNumber(errorObj?.code)
    if (typeof parsedCode === 'number') code = parsedCode
    const parsedMessage = asString(errorObj?.message)
    if (parsedMessage) message = parsedMessage
  } catch {
    // ignore parse error, keep fallback message
  }

  const retryAfter = response.headers?.get('retry-after') ?? null

  return {
    status: response.status,
    statusText: response.statusText,
    code,
    message: message ?? `OpenRouter request failed: HTTP ${response.status} ${response.statusText}`.trim(),
    retryAfter,
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text()
  if (!response.ok) {
    throw parseHttpError(response, bodyText)
  }
  if (!bodyText.trim()) return {}
  try {
    return JSON.parse(bodyText)
  } catch {
    throw new Error(`OpenRouter returned invalid JSON: ${bodyText.slice(0, 200)}`)
  }
}

function ensureDataArray(payload: unknown, endpoint: string): unknown[] {
  const objectPayload = asObject(payload)
  const data = objectPayload?.data
  if (Array.isArray(data)) return data
  throw new Error(`OpenRouter ${endpoint} response missing data[]`)
}

function ensureCount(payload: unknown): number {
  const objectPayload = asObject(payload)
  const data = asObject(objectPayload?.data)
  const count = asNumber(data?.count)
  if (typeof count === 'number') return count
  throw new Error('OpenRouter /models/count response missing data.count')
}

function ensureEndpointsArray(payload: unknown): unknown[] {
  const objectPayload = asObject(payload)
  const data = objectPayload?.data
  if (Array.isArray(data)) return data
  const dataObject = asObject(data)
  if (Array.isArray(dataObject?.endpoints)) return dataObject.endpoints
  throw new Error('OpenRouter /models/:author/:slug/endpoints response missing data.endpoints[]')
}

function mapMetric(raw: unknown): CatalogEndpointMetric | null {
  const obj = asObject(raw)
  if (!obj) return null
  const metric: CatalogEndpointMetric = {
    ...(asNumber(obj.p50) != null ? { p50: asNumber(obj.p50) ?? undefined } : {}),
    ...(asNumber(obj.p75) != null ? { p75: asNumber(obj.p75) ?? undefined } : {}),
    ...(asNumber(obj.p90) != null ? { p90: asNumber(obj.p90) ?? undefined } : {}),
    ...(asNumber(obj.p99) != null ? { p99: asNumber(obj.p99) ?? undefined } : {}),
  }
  return Object.keys(metric).length > 0 ? metric : null
}

function mapOpenRouterModelEndpoint(raw: Record<string, unknown>): CatalogModelEndpoint {
  return {
    providerName: asString(raw.provider_name),
    tag: asString(raw.tag),
    quantization: asString(raw.quantization),
    contextLength: asNumber(raw.context_length),
    maxCompletionTokens: asNumber(raw.max_completion_tokens),
    maxPromptTokens: asNumber(raw.max_prompt_tokens),
    supportedParameters: asStringArray(raw.supported_parameters),
    uptimeLast30m: asNumber(raw.uptime_last_30m),
    supportsImplicitCaching: asBoolean(raw.supports_implicit_caching),
    latencyLast30m: mapMetric(raw.latency_last_30m),
    throughputLast30m: mapMetric(raw.throughput_last_30m),
    status: asNumber(raw.status) as CatalogModelEndpoint['status'],
  }
}

export function mapOpenRouterModelToCatalogModel(
  raw: OpenRouterModelObject,
  context: Readonly<{
    providerKey: string
    source: OpenRouterModelsSource
    fetchedAtMs: number
    baseUrl: string
  }>
): CatalogModel | null {
  const modelId = asString(raw.id)
  if (!modelId) return null

  const displayName = asString(raw.name) ?? modelId
  const architecture = asObject(raw.architecture)
  const canonicalSlug = asString(raw.canonical_slug)
  const description = asString(raw.description)
  const contextLength = asNumber(raw.context_length)
  const tokenizer = asString(architecture?.tokenizer)
  const instructType = asString(architecture?.instruct_type)
  const topProvider = asObject(raw.top_provider)
  const topProviderContextLength = asNumber(topProvider?.context_length)
  const maxOutputTokens = asNumber(topProvider?.max_completion_tokens)
  const topProviderIsModerated = asBoolean(topProvider?.is_moderated)
  const supportedParameters = asStringArray(raw.supported_parameters)
  const perRequestLimits =
    raw.per_request_limits === null || raw.per_request_limits === undefined
      ? null
      : toJsonValue(raw.per_request_limits)
  const defaultParameters =
    raw.default_parameters === null || raw.default_parameters === undefined
      ? null
      : toJsonValue(raw.default_parameters)
  const createdAtSec = asUnixSeconds(raw.created)
  const expirationDate = asString(raw.expiration_date)
  const modalities = resolveModalities(raw)
  const capabilities = resolveCapabilities(supportedParameters, modalities, contextLength)
  const pricing = resolvePricing(raw)
  const status = resolveModelStatus(expirationDate)
  const vendor = deriveVendor(modelId)
  const modelKey = buildModelKey(context.providerKey, modelId)
  const updatedAtMs = context.fetchedAtMs

  const model: CatalogModel = {
    modelKey,
    providerKey: context.providerKey,
    modelId,
    canonicalSlug,
    displayName,
    description,
    vendor,
    family: deriveFamily(modelId),
    status,
    visibility: 'visible',
    contextLength,
    maxOutputTokens,
    architectureModality: modalities.architectureModality,
    inputModalities: modalities.inputModalities,
    outputModalities: modalities.outputModalities,
    tokenizer,
    instructType,
    supportedParameters,
    capabilities,
    pricing,
    perRequestLimits,
    defaultParameters,
    topProviderContextLength,
    topProviderIsModerated,
    createdAtSec,
    expirationDate,
    tags: [],
    firstSeenAtMs: updatedAtMs,
    lastSeenAtMs: updatedAtMs,
    syncedAtMs: updatedAtMs,
    raw: buildRawEnvelope(context.source, updatedAtMs, context.baseUrl, raw),
  }

  return {
    ...model,
    tags: deriveModelTags({
      modelKey: model.modelKey,
      inputModalities: model.inputModalities,
      supportedParameters: model.supportedParameters,
      contextLength: model.contextLength ?? null,
      pricing: model.pricing ?? null,
      updatedAtMs,
    }),
  }
}

export function mapOpenRouterProviderToCatalogProvider(
  raw: OpenRouterProviderObject,
  context: Readonly<{
    fetchedAtMs: number
    baseUrl: string
  }>
): CatalogProvider {
  const providerKey = normalizeOpenRouterProviderSlug(raw)
  return {
    providerKey,
    displayName: asString(raw.name) ?? providerKey,
    slug: asString(raw.slug),
    privacyPolicyUrl: asString(raw.privacy_policy_url),
    termsOfServiceUrl: asString(raw.terms_of_service_url),
    statusPageUrl: asString(raw.status_page_url),
    updatedAtMs: context.fetchedAtMs,
    raw: buildRawEnvelope('providers', context.fetchedAtMs, context.baseUrl, raw),
  }
}

export class OpenRouterCatalogClient implements ProviderAdapter {
  readonly providerKey = PROVIDERS.OPENROUTER
  readonly displayName = 'OpenRouter'
  private fetchImpl: typeof fetch
  private httpReferer: string
  private xTitle: string

  constructor(options: OpenRouterFetchOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.httpReferer = options.httpReferer ?? OPENROUTER_ATTRIBUTION_REFERER
    this.xTitle = options.xTitle ?? OPENROUTER_ATTRIBUTION_TITLE
  }

  private buildHeaders(apiKey: string): HeadersInit {
    return {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': this.httpReferer,
      'X-Title': this.xTitle,
    }
  }

  private async getJson(pathname: string, ctx: OpenRouterFetchContext): Promise<unknown> {
    const response = await this.fetchImpl(`${ctx.baseUrl}${pathname}`, {
      method: 'GET',
      headers: this.buildHeaders(ctx.apiKey),
      signal: ctx.signal ?? undefined,
    })
    return readJsonResponse(response)
  }

  private async fetchModelsBySource(
    source: OpenRouterModelsSource,
    ctx: OpenRouterFetchContext
  ): Promise<Readonly<{ fetchedAtMs: number; models: OpenRouterModelObject[] }>> {
    const endpoint = source === 'models_user' ? '/models/user' : '/models'
    const payload = await this.getJson(endpoint, ctx)
    const data = ensureDataArray(payload, endpoint)
    return {
      fetchedAtMs: Date.now(),
      models: data
        .map((item) => asObject(item))
        .filter((item): item is OpenRouterModelObject => item != null),
    }
  }

  async listModels(input: AdapterListModelsInput): Promise<AdapterListModelsResult> {
    const requestedAtMs = Date.now()
    const baseUrl = normalizeBaseUrl(input.baseUrl || OPENROUTER_DEFAULT_BASE_URL)
    const ctx: OpenRouterFetchContext = {
      apiKey: input.apiKey,
      baseUrl,
      signal: input.signal ?? null,
    }

    const sourceOrder: OpenRouterModelsSource[] = input.preferUserScopedModels ? ['models_user', 'models'] : ['models']
    let selectedSource: OpenRouterModelsSource = sourceOrder[0]
    let usedFallback = false
    let fetchedAtMs = requestedAtMs
    let modelsPayload: OpenRouterModelObject[] = []
    let lastError: unknown = null

    for (let index = 0; index < sourceOrder.length; index += 1) {
      const source = sourceOrder[index]
      try {
        const result = await this.fetchModelsBySource(source, ctx)
        selectedSource = source
        fetchedAtMs = result.fetchedAtMs
        modelsPayload = result.models
        usedFallback = index > 0
        lastError = null
        break
      } catch (error) {
        lastError = error
      }
    }

    if (lastError) {
      throw lastError
    }

    const models = modelsPayload
      .map((raw) =>
        mapOpenRouterModelToCatalogModel(raw, {
          providerKey: this.providerKey,
          source: selectedSource,
          fetchedAtMs,
          baseUrl,
        })
      )
      .filter((item): item is CatalogModel => item != null)

    const completedAtMs = Date.now()
    return {
      models,
      meta: {
        primarySource: selectedSource,
        usedFallback,
        requestedAtMs,
        completedAtMs,
      },
    }
  }

  async listProviders(input: AdapterListProvidersInput): Promise<ReadonlyArray<CatalogProvider>> {
    const baseUrl = normalizeBaseUrl(input.baseUrl || OPENROUTER_DEFAULT_BASE_URL)
    const payload = await this.getJson('/providers', {
      apiKey: input.apiKey,
      baseUrl,
      signal: input.signal ?? null,
    })

    const providers = ensureDataArray(payload, '/providers')
    const fetchedAtMs = Date.now()
    return providers
      .map((item) => asObject(item))
      .filter((item): item is OpenRouterProviderObject => item != null)
      .map((raw) => mapOpenRouterProviderToCatalogProvider(raw, { fetchedAtMs, baseUrl }))
  }

  async listModelsCount(input: AdapterListProvidersInput): Promise<OpenRouterModelsCountResult> {
    const baseUrl = normalizeBaseUrl(input.baseUrl || OPENROUTER_DEFAULT_BASE_URL)
    const payload = await this.getJson('/models/count', {
      apiKey: input.apiKey,
      baseUrl,
      signal: input.signal ?? null,
    })
    return {
      count: ensureCount(payload),
      fetchedAtMs: Date.now(),
    }
  }

  async getModelEndpoints(input: AdapterGetModelEndpointsInput): Promise<CatalogModelEndpoints | null> {
    const baseUrl = normalizeBaseUrl(input.baseUrl || OPENROUTER_DEFAULT_BASE_URL)
    const author = asString(input.author)
    const slug = asString(input.slug)
    const modelId = asString(input.modelId)
    if (!author || !slug || !modelId) {
      throw new Error('OpenRouter getModelEndpoints requires non-empty author/slug/modelId')
    }

    const endpoint = `/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`
    const payload = await this.getJson(endpoint, {
      apiKey: input.apiKey,
      baseUrl,
      signal: input.signal ?? null,
    })
    const fetchedAtMs = Date.now()
    const endpoints = ensureEndpointsArray(payload)
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .map((item) => mapOpenRouterModelEndpoint(item))

    return {
      providerKey: this.providerKey,
      modelId,
      author,
      slug,
      fetchedAtMs,
      endpoints,
      raw: {
        schemaVersion: OPENROUTER_RAW_SCHEMA_VERSION,
        buckets: [
          {
            source: 'endpoints',
            fetchedAtMs,
            baseUrl,
            payload: toJsonValue(payload),
          },
        ],
      },
    }
  }
}
