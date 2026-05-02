export type SearchMode = 'enable' | 'default' | 'disable'
export type SearchDepth = 'default' | 'low' | 'medium' | 'high' | 'custom'
export type SearchEngine = 'default' | 'auto' | 'native' | 'exa'
export type SearchContextSize = 'low' | 'medium' | 'high'

export type SearchPromptSetting =
  | Readonly<{ mode: 'default' }>
  | Readonly<{ mode: 'useStarversePreset' }>
  | Readonly<{ mode: 'customText'; text: string }>

export type SearchSettingsLayer = Readonly<{
  searchMode?: SearchMode | null
  searchDepth?: SearchDepth | null
  maxResults?: number | null
  searchEngine?: SearchEngine | null
  searchPrompt?: SearchPromptSetting | null
}>

export type SearchSettingsLayers = Readonly<{
  convo?: SearchSettingsLayer | null
  project?: SearchSettingsLayer | null
  global?: SearchSettingsLayer | null
}>

export type OpenRouterWebPluginPatch = Readonly<{
  id: 'web'
  enabled?: boolean
  engine?: 'auto' | 'native' | 'exa'
  max_results?: number
  search_prompt?: string
}>

export type OpenRouterWebRequestPatch = Readonly<{
  plugins?: ReadonlyArray<OpenRouterWebPluginPatch>
  web_search_options?: Readonly<{ search_context_size: SearchContextSize }>
}>

export type ResolvedSearchSettings = Readonly<{
  resolvedMode: SearchMode
  resolvedDepth: SearchDepth
  resolvedEngine: SearchEngine
  effectiveMode: boolean
  /**
   * '' means auto (omit explicit engine from request patch).
   */
  effectiveEngine: '' | 'native' | 'exa'
  effectiveMaxResults: number
  effectiveSearchContextSize: SearchContextSize
  effectiveSearchPrompt: string | null
  requestPatch: OpenRouterWebRequestPatch
}>

export type ResolveSearchSettingsOptions = Readonly<{
  accountDefaultEnabled?: boolean
  customMaxResultsFallback?: number
  starverseSearchPromptPreset?: string
}>

const MIN_MAX_RESULTS = 1
const MAX_MAX_RESULTS = 10
const DEPTH_RESULTS_DEFAULT = 5
const DEPTH_RESULTS_LOW = 3
const DEPTH_RESULTS_MEDIUM = 5
const DEPTH_RESULTS_HIGH = 8

const STARVERSE_SEARCH_PROMPT_PRESET_DEFAULT =
  'Prioritize trustworthy, recent sources and cite only URLs you actually used.'

function normalizeMode(value: unknown): SearchMode {
  if (value === 'enable' || value === 'disable' || value === 'default') return value
  return 'default'
}

function normalizeDepth(value: unknown): SearchDepth {
  if (value === 'default' || value === 'low' || value === 'medium' || value === 'high' || value === 'custom') return value
  return 'default'
}

function normalizeEngine(value: unknown): SearchEngine {
  if (value === 'default' || value === 'auto' || value === 'native' || value === 'exa') return value
  return 'default'
}

function normalizePrompt(
  value: unknown
): SearchPromptSetting {
  if (!value || typeof value !== 'object') return { mode: 'default' }
  const mode = (value as any).mode
  if (mode === 'useStarversePreset') return { mode: 'useStarversePreset' }
  if (mode === 'customText') {
    const text = typeof (value as any).text === 'string' ? (value as any).text.trim() : ''
    if (text.length > 0) return { mode: 'customText', text }
    return { mode: 'default' }
  }
  return { mode: 'default' }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function firstConcreteMode(layers: Array<SearchSettingsLayer | null | undefined>): SearchMode {
  for (const layer of layers) {
    const mode = normalizeMode(layer?.searchMode)
    if (mode !== 'default') return mode
  }
  return 'default'
}

function firstConcreteDepth(layers: Array<SearchSettingsLayer | null | undefined>): SearchDepth {
  for (const layer of layers) {
    const depth = normalizeDepth(layer?.searchDepth)
    if (depth !== 'default') return depth
  }
  return 'default'
}

function firstConcreteEngine(layers: Array<SearchSettingsLayer | null | undefined>): Exclude<SearchEngine, 'default'> {
  for (const layer of layers) {
    const engine = normalizeEngine(layer?.searchEngine)
    if (engine !== 'default') return engine
  }
  return 'auto'
}

function firstConcretePrompt(
  layers: Array<SearchSettingsLayer | null | undefined>
): SearchPromptSetting {
  for (const layer of layers) {
    const prompt = normalizePrompt(layer?.searchPrompt)
    if (prompt.mode !== 'default') return prompt
  }
  return { mode: 'default' }
}

function mapDepthToMaxResults(depth: SearchDepth): number {
  if (depth === 'low') return DEPTH_RESULTS_LOW
  if (depth === 'high') return DEPTH_RESULTS_HIGH
  if (depth === 'medium') return DEPTH_RESULTS_MEDIUM
  return DEPTH_RESULTS_DEFAULT
}

function mapCustomMaxResultsToContextSize(maxResults: number): SearchContextSize {
  if (maxResults <= 3) return 'low'
  if (maxResults <= 7) return 'medium'
  return 'high'
}

function mapDepthToContextSize(depth: SearchDepth, maxResults: number): SearchContextSize {
  if (depth === 'low') return 'low'
  if (depth === 'high') return 'high'
  if (depth === 'custom') return mapCustomMaxResultsToContextSize(maxResults)
  return 'medium'
}

function resolveCustomMaxResults(
  layers: Array<SearchSettingsLayer | null | undefined>,
  fallback: number
): number {
  for (const layer of layers) {
    const raw = layer?.maxResults
    if (raw === null || raw === undefined) continue
    return clampInt(raw, MIN_MAX_RESULTS, MAX_MAX_RESULTS, fallback)
  }
  return clampInt(fallback, MIN_MAX_RESULTS, MAX_MAX_RESULTS, DEPTH_RESULTS_DEFAULT)
}

function resolveEffectivePromptText(
  prompt: SearchPromptSetting,
  presetText: string
): string | null {
  if (prompt.mode === 'useStarversePreset') return presetText
  if (prompt.mode === 'customText') return prompt.text.trim()
  return null
}

export function resolveSearchSettings(
  layers: SearchSettingsLayers,
  options: ResolveSearchSettingsOptions = {}
): ResolvedSearchSettings {
  const ordered = [layers.convo, layers.project, layers.global]

  const resolvedMode = firstConcreteMode(ordered)
  const resolvedDepth = firstConcreteDepth(ordered)
  const resolvedEngine = firstConcreteEngine(ordered)
  const resolvedPrompt = firstConcretePrompt(ordered)

  const accountDefaultEnabled = options.accountDefaultEnabled === true
  const effectiveMode =
    resolvedMode === 'enable'
      ? true
      : resolvedMode === 'disable'
        ? false
        : accountDefaultEnabled

  const customFallback = options.customMaxResultsFallback ?? DEPTH_RESULTS_DEFAULT
  const effectiveMaxResults =
    resolvedDepth === 'custom'
      ? resolveCustomMaxResults(ordered, customFallback)
      : mapDepthToMaxResults(resolvedDepth)

  const effectiveSearchContextSize = mapDepthToContextSize(resolvedDepth, effectiveMaxResults)
  const effectiveEngine: ResolvedSearchSettings['effectiveEngine'] = resolvedEngine === 'auto' ? '' : resolvedEngine
  const preset = options.starverseSearchPromptPreset?.trim() || STARVERSE_SEARCH_PROMPT_PRESET_DEFAULT
  const effectiveSearchPrompt = resolveEffectivePromptText(resolvedPrompt, preset)

  const requestPatch: OpenRouterWebRequestPatch = {}
  if (resolvedMode === 'enable') {
    const plugin: OpenRouterWebPluginPatch = {
      id: 'web',
      enabled: true,
      max_results: effectiveMaxResults,
      ...(effectiveEngine ? { engine: effectiveEngine } : {}),
      ...(effectiveSearchPrompt ? { search_prompt: effectiveSearchPrompt } : {}),
    }
    return {
      resolvedMode,
      resolvedDepth,
      resolvedEngine,
      effectiveMode,
      effectiveEngine,
      effectiveMaxResults,
      effectiveSearchContextSize,
      effectiveSearchPrompt,
      requestPatch: {
        plugins: [plugin],
        web_search_options: { search_context_size: effectiveSearchContextSize },
      },
    }
  }

  if (resolvedMode === 'disable') {
    return {
      resolvedMode,
      resolvedDepth,
      resolvedEngine,
      effectiveMode,
      effectiveEngine,
      effectiveMaxResults,
      effectiveSearchContextSize,
      effectiveSearchPrompt,
      requestPatch: {
        plugins: [{ id: 'web', enabled: false }],
      },
    }
  }

  return {
    resolvedMode,
    resolvedDepth,
    resolvedEngine,
    effectiveMode,
    effectiveEngine,
    effectiveMaxResults,
    effectiveSearchContextSize,
    effectiveSearchPrompt,
    requestPatch,
  }
}

