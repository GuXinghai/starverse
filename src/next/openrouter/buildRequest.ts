import type { OpenRouterWebRequestPatch } from './searchSettingsResolver'
import {
  normalizeSamplingParamNumericValue,
  type OpenRouterSamplingParamsPatch,
} from './samplingParamsResolver'
import { OPENROUTER_SAMPLING_PARAM_KEYS } from './samplingParamsCatalog'

export type OpenRouterReasoningEffort =
  | 'xhigh'
  | 'high'
  | 'medium'
  | 'low'
  | 'minimal'
  | 'none'

export type OpenRouterReasoningInput =
  | {
      effort: OpenRouterReasoningEffort
      exclude?: boolean
    }
  | {
      max_tokens: number
      exclude?: boolean
    }

export type OpenRouterOutputModality = 'image' | 'text'

export type OpenRouterImageConfig = Readonly<{
  aspect_ratio?: string
  image_size?: string
} & Record<string, unknown>>

export type OpenRouterDebugConfig = Readonly<{
  echoUpstreamBody?: boolean
}>

export type OpenRouterWebPlugin = Readonly<{
  id: 'web'
  enabled?: boolean
  engine?: 'auto' | 'native' | 'exa'
  max_results?: number
  search_prompt?: string
}>

export type OpenRouterFileParserEngine = 'native' | 'cloudflare-ai' | 'mistral-ocr'

export type OpenRouterFileParserPlugin = Readonly<{
  id: 'file-parser'
  pdf?: Readonly<{
    engine?: OpenRouterFileParserEngine
  }>
}>

export type OpenRouterAdditionalPlugin = OpenRouterFileParserPlugin
export type OpenRouterRequestPlugin = OpenRouterWebPlugin | OpenRouterAdditionalPlugin

export type BuildOpenRouterRequestInput = Readonly<{
  model: string
  messages: ReadonlyArray<unknown>
  stream: boolean
  reasoning?: OpenRouterReasoningInput
  tools?: unknown[]
  modalities?: ReadonlyArray<OpenRouterOutputModality>
  imageConfig?: OpenRouterImageConfig
  /**
   * OpenRouter provider routing parameter.
   * Body field is snake_case: provider.require_parameters.
   * Default: false (keeps legacy behavior).
   */
  providerRequireParameters?: boolean
  /**
   * Resolved web-search patch from search settings resolver.
   */
  webSearchPatch?: OpenRouterWebRequestPatch
  /**
   * Chat Completions support note:
   * - `native_only` (default): only include `web_search_options` when engine=native.
   * - `always`: always include `web_search_options` when provided.
   */
  webSearchContextPolicy?: 'always' | 'native_only'
  samplingParams?: OpenRouterSamplingParamsPatch
  debug?: OpenRouterDebugConfig
  additionalPlugins?: ReadonlyArray<OpenRouterAdditionalPlugin>
}>

export type OpenRouterChatCompletionsRequest = Readonly<{
  model: string
  messages: ReadonlyArray<unknown>
  stream: boolean
  reasoning?: Record<string, unknown>
  tools?: unknown[]
  provider?: { require_parameters: boolean }
  plugins?: ReadonlyArray<OpenRouterRequestPlugin>
  web_search_options?: Readonly<{ search_context_size: 'low' | 'medium' | 'high' }>
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  top_a?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  seed?: number
  max_tokens?: number
  debug?: Readonly<{
    echo_upstream_body?: boolean
  }>
  modalities?: ReadonlyArray<OpenRouterOutputModality>
  image_config?: OpenRouterImageConfig
}>

type MutableOpenRouterChatCompletionsRequest = {
  model: string
  messages: unknown[]
  stream: boolean
  reasoning?: Record<string, unknown>
  tools?: unknown[]
  provider?: { require_parameters: boolean }
  modalities?: OpenRouterOutputModality[]
  image_config?: OpenRouterImageConfig
  plugins?: OpenRouterRequestPlugin[]
  web_search_options?: { search_context_size: 'low' | 'medium' | 'high' }
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  top_a?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  seed?: number
  max_tokens?: number
  debug?: { echo_upstream_body?: boolean }
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be boolean`)
  }
}

function assertPositiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

function isContextSize(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high'
}

function normalizeOutputModalities(raw: unknown): OpenRouterOutputModality[] {
  if (!Array.isArray(raw)) throw new Error('modalities must be an array')
  const normalized: OpenRouterOutputModality[] = []
  const seen = new Set<OpenRouterOutputModality>()
  for (const value of raw) {
    const modality = String(value ?? '').trim().toLowerCase()
    if (modality !== 'image' && modality !== 'text') {
      throw new Error('modalities supports only text/image for image generation')
    }
    const typed = modality as OpenRouterOutputModality
    if (seen.has(typed)) continue
    seen.add(typed)
    normalized.push(typed)
  }
  if (normalized.length === 0) throw new Error('modalities must include at least one modality')
  return normalized
}

function normalizeImageConfig(raw: unknown): OpenRouterImageConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('imageConfig must be an object')
  }
  const value = raw as Record<string, unknown>
  const normalized: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue
    normalized[key] = v
  }

  if ('aspect_ratio' in normalized) {
    assertNonEmptyString(normalized.aspect_ratio, 'imageConfig.aspect_ratio')
    normalized.aspect_ratio = String(normalized.aspect_ratio).trim()
  }
  if ('image_size' in normalized) {
    assertNonEmptyString(normalized.image_size, 'imageConfig.image_size')
    normalized.image_size = String(normalized.image_size).trim()
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error('imageConfig must include at least one field')
  }
  return normalized as OpenRouterImageConfig
}

function assertImageGenerationPatchConsistency(input: Readonly<{
  modalities?: ReadonlyArray<OpenRouterOutputModality>
  imageConfig?: OpenRouterImageConfig
}>) {
  if (input.imageConfig && !input.modalities) {
    throw new Error('imageConfig requires image modalities')
  }
  if (input.modalities && !input.modalities.includes('image')) {
    throw new Error('modalities must include image when image generation is requested')
  }
}

function normalizeWebPlugin(raw: unknown):
  | OpenRouterWebPlugin
  | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (v.id !== 'web') return null

  const plugin: {
    id: 'web'
    enabled?: boolean
    engine?: 'auto' | 'native' | 'exa'
    max_results?: number
    search_prompt?: string
  } = { id: 'web' }

  if (v.enabled !== undefined) {
    assertBoolean(v.enabled, 'plugins[].enabled')
    plugin.enabled = v.enabled
  }
  if (v.engine !== undefined) {
    if (v.engine !== 'auto' && v.engine !== 'native' && v.engine !== 'exa') {
      throw new Error('plugins[].engine is invalid')
    }
    plugin.engine = v.engine
  }
  if (v.max_results !== undefined) {
    assertPositiveInteger(v.max_results, 'plugins[].max_results')
    plugin.max_results = v.max_results
  }
  if (v.search_prompt !== undefined) {
    if (typeof v.search_prompt !== 'string') throw new Error('plugins[].search_prompt must be string')
    const trimmed = v.search_prompt.trim()
    if (trimmed.length > 0) plugin.search_prompt = trimmed
  }
  return plugin
}

function normalizeAdditionalPlugin(raw: unknown): OpenRouterAdditionalPlugin {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('additionalPlugins[] must be an object')
  }

  const value = raw as Record<string, unknown>
  if (value.id !== 'file-parser') {
    throw new Error('additionalPlugins[] only supports file-parser')
  }

  if (value.pdf === undefined) {
    return { id: 'file-parser' }
  }

  if (!value.pdf || typeof value.pdf !== 'object' || Array.isArray(value.pdf)) {
    throw new Error('additionalPlugins[].pdf must be an object')
  }

  const pdf = value.pdf as Record<string, unknown>
  if (pdf.engine === undefined) {
    return { id: 'file-parser', pdf: {} }
  }
  if (pdf.engine !== 'native' && pdf.engine !== 'cloudflare-ai' && pdf.engine !== 'mistral-ocr') {
    throw new Error('additionalPlugins[].pdf.engine is invalid')
  }
  return {
    id: 'file-parser',
    pdf: {
      engine: pdf.engine,
    },
  }
}

function normalizeSamplingParamsPatch(raw: unknown): OpenRouterSamplingParamsPatch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('samplingParams must be an object')
  }
  const value = raw as Record<string, unknown>
  const next: Partial<Record<(typeof OPENROUTER_SAMPLING_PARAM_KEYS)[number], number>> = {}
  for (const key of OPENROUTER_SAMPLING_PARAM_KEYS) {
    if (!(key in value)) continue
    const normalized = normalizeSamplingParamNumericValue(key, value[key])
    if (normalized === null) {
      throw new Error(`samplingParams.${key} is invalid`)
    }
    next[key] = normalized
  }
  return next
}

function createBaseRequest(input: BuildOpenRouterRequestInput): MutableOpenRouterChatCompletionsRequest {
  return {
    model: input.model,
    messages: [...input.messages],
    stream: input.stream,
  }
}

function applyProviderPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (input.providerRequireParameters === undefined) return
  assertBoolean(input.providerRequireParameters, 'providerRequireParameters')
  request.provider = { require_parameters: input.providerRequireParameters }
}

function applyToolsPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (input.tools === undefined) return
  if (!Array.isArray(input.tools)) {
    throw new Error('tools must be an array')
  }
  request.tools = input.tools
}

function applyImageGenerationPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (input.modalities !== undefined) {
    request.modalities = normalizeOutputModalities(input.modalities)
  }
  if (input.imageConfig !== undefined) {
    request.image_config = normalizeImageConfig(input.imageConfig)
  }
  assertImageGenerationPatchConsistency({
    modalities: request.modalities,
    imageConfig: request.image_config,
  })
}

function applySamplingParamsPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (input.samplingParams === undefined) return
  const sampling = normalizeSamplingParamsPatch(input.samplingParams)
  for (const key of OPENROUTER_SAMPLING_PARAM_KEYS) {
    const value = sampling[key]
    if (value === undefined) continue
    ;(request as Record<string, unknown>)[key] = value
  }
}

function assertReasoningModeCount(reasoning: Record<string, unknown>) {
  const hasEffort = 'effort' in reasoning
  const hasMaxTokens = 'max_tokens' in reasoning
  const modeCount = [hasEffort, hasMaxTokens].filter(Boolean).length
  if (modeCount !== 1) {
    throw new Error('reasoning must specify exactly one of effort/max_tokens')
  }
  return { hasEffort, hasMaxTokens }
}

function assertReasoningExclude(reasoning: Record<string, unknown>) {
  if ('exclude' in reasoning && typeof reasoning.exclude !== 'boolean') {
    throw new Error('reasoning.exclude must be boolean')
  }
}

function normalizeReasoningEffort(reasoning: Record<string, unknown>): Record<string, unknown> {
  const effort = reasoning.effort
  if (
    effort !== 'xhigh' &&
    effort !== 'high' &&
    effort !== 'medium' &&
    effort !== 'low' &&
    effort !== 'minimal' &&
    effort !== 'none'
  ) {
    throw new Error('reasoning.effort is invalid')
  }
  const exclude = effort === 'none' ? undefined : ('exclude' in reasoning ? reasoning.exclude : undefined)
  return exclude === undefined ? { effort } : { effort, exclude }
}

function normalizeReasoningMaxTokens(reasoning: Record<string, unknown>): Record<string, unknown> {
  assertPositiveInteger(reasoning.max_tokens, 'reasoning.max_tokens')
  return reasoning.exclude === undefined
    ? { max_tokens: reasoning.max_tokens }
    : { max_tokens: reasoning.max_tokens, exclude: reasoning.exclude }
}

function normalizeReasoningRequest(raw: OpenRouterReasoningInput): Record<string, unknown> {
  const reasoning = raw as Record<string, unknown>
  const { hasEffort } = assertReasoningModeCount(reasoning)
  assertReasoningExclude(reasoning)
  return hasEffort
    ? normalizeReasoningEffort(reasoning)
    : normalizeReasoningMaxTokens(reasoning)
}

function applyDebugPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (!input.debug || typeof input.debug !== 'object') return
  const rawEcho = (input.debug as Record<string, unknown>).echoUpstreamBody
  if (rawEcho === undefined) return
  assertBoolean(rawEcho, 'debug.echoUpstreamBody')
  if (input.stream && rawEcho === true) {
    request.debug = { echo_upstream_body: true }
  }
}

function applyWebSearchPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  const webPatch = input.webSearchPatch
  if (!webPatch) return
  const rawPlugins = Array.isArray(webPatch.plugins) ? webPatch.plugins : []
  const webPlugin = rawPlugins.map((row) => normalizeWebPlugin(row)).find((row) => row !== null) ?? null
  if (!webPlugin) return

  request.plugins = [...(request.plugins ?? []), webPlugin]
  const contextSize = webPatch.web_search_options?.search_context_size
  const policy = input.webSearchContextPolicy ?? 'native_only'
  const allowContext = policy === 'always' || (policy === 'native_only' && webPlugin.engine === 'native')
  if (allowContext && isContextSize(contextSize)) {
    request.web_search_options = { search_context_size: contextSize }
  }
}

function applyAdditionalPluginsPatch(request: MutableOpenRouterChatCompletionsRequest, input: BuildOpenRouterRequestInput) {
  if (input.additionalPlugins === undefined) return
  if (!Array.isArray(input.additionalPlugins)) {
    throw new Error('additionalPlugins must be an array')
  }
  const normalized = input.additionalPlugins.map((plugin) => normalizeAdditionalPlugin(plugin))
  if (normalized.length === 0) return
  request.plugins = [...(request.plugins ?? []), ...normalized]
}

/**
 * Pure request builder for OpenRouter Chat Completions.
 *
 * Rules (SSOT-aligned):
 * - `stream` must be boolean (reject "true"/"false" strings)
 * - `reasoning` only concerns request payload, never UI display
 * - `reasoning.effort = "none"` is the only definition of "disable reasoning", and must not be combined with `max_tokens`
 * - `effort` and `max_tokens` are treated as mutually exclusive control modes
 */
export function buildOpenRouterChatCompletionsRequest(
  input: BuildOpenRouterRequestInput
): OpenRouterChatCompletionsRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('input is required')
  }
  if (!input.model || typeof input.model !== 'string') {
    throw new Error('model is required')
  }
  if (!Array.isArray(input.messages)) {
    throw new Error('messages must be an array')
  }
  assertBoolean(input.stream, 'stream')

  const request = createBaseRequest(input)
  applyProviderPatch(request, input)
  applyToolsPatch(request, input)
  applyImageGenerationPatch(request, input)
  applySamplingParamsPatch(request, input)

  if (input.reasoning) {
    request.reasoning = normalizeReasoningRequest(input.reasoning)
  }

  applyDebugPatch(request, input)
  applyWebSearchPatch(request, input)
  applyAdditionalPluginsPatch(request, input)
  return request
}
