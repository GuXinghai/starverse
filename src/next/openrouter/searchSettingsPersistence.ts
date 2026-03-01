import {
  resolveSearchSettings,
  type ResolveSearchSettingsOptions,
  type ResolvedSearchSettings,
  type SearchDepth,
  type SearchEngine,
  type SearchMode,
  type SearchPromptSetting,
  type SearchSettingsLayer,
} from './searchSettingsResolver'

export const PROJECT_WEB_SEARCH_DEFAULTS_META_KEY = 'webSearchDefaults'
export const CONVO_WEB_SEARCH_OVERRIDE_META_KEY = 'webSearchOverride'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeMode(value: unknown): SearchMode | undefined {
  if (value === 'enable' || value === 'default' || value === 'disable') return value
  return undefined
}

function normalizeDepth(value: unknown): SearchDepth | undefined {
  if (value === 'default' || value === 'low' || value === 'medium' || value === 'high' || value === 'custom') return value
  return undefined
}

function normalizeEngine(value: unknown): SearchEngine | undefined {
  if (value === 'default' || value === 'auto' || value === 'native' || value === 'exa') return value
  return undefined
}

function normalizeSearchPrompt(value: unknown): SearchPromptSetting | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  const mode = raw.mode
  if (mode === 'default') return { mode: 'default' }
  if (mode === 'useStarversePreset') return { mode: 'useStarversePreset' }
  if (mode === 'customText') {
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (text.length === 0) return undefined
    return { mode: 'customText', text }
  }
  return undefined
}

function normalizeMaxResults(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  if (rounded < 1) return 1
  if (rounded > 10) return 10
  return rounded
}

export function normalizeSearchSettingsLayer(raw: unknown): SearchSettingsLayer | null {
  const value = asRecord(raw)
  if (!value) return null

  const next: SearchSettingsLayer = {}

  const mode = normalizeMode(value.searchMode)
  if (mode !== undefined) next.searchMode = mode

  const depth = normalizeDepth(value.searchDepth)
  if (depth !== undefined) next.searchDepth = depth

  const engine = normalizeEngine(value.searchEngine)
  if (engine !== undefined) next.searchEngine = engine

  const maxResults = normalizeMaxResults(value.maxResults)
  if (maxResults !== undefined) next.maxResults = maxResults

  const searchPrompt = normalizeSearchPrompt(value.searchPrompt)
  if (searchPrompt !== undefined) next.searchPrompt = searchPrompt

  if (next.searchDepth !== 'custom' && next.maxResults !== undefined) {
    delete (next as any).maxResults
  }

  return Object.keys(next).length > 0 ? next : null
}

export function extractProjectWebSearchDefaults(meta: unknown): SearchSettingsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeSearchSettingsLayer(root[PROJECT_WEB_SEARCH_DEFAULTS_META_KEY])
}

export function extractConvoWebSearchOverride(meta: unknown): SearchSettingsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeSearchSettingsLayer(root[CONVO_WEB_SEARCH_OVERRIDE_META_KEY])
}

export function mergeProjectWebSearchDefaultsMeta(
  meta: unknown,
  layer: SearchSettingsLayer | null
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const normalized = normalizeSearchSettingsLayer(layer)
  if (normalized) next[PROJECT_WEB_SEARCH_DEFAULTS_META_KEY] = normalized
  else delete next[PROJECT_WEB_SEARCH_DEFAULTS_META_KEY]
  return next
}

export function mergeConvoWebSearchOverrideMeta(
  meta: unknown,
  layer: SearchSettingsLayer | null
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const normalized = normalizeSearchSettingsLayer(layer)
  if (normalized) next[CONVO_WEB_SEARCH_OVERRIDE_META_KEY] = normalized
  else delete next[CONVO_WEB_SEARCH_OVERRIDE_META_KEY]
  return next
}

export function resolveSearchSettingsFromStoredLayers(input: Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalDefaults?: unknown
  options?: ResolveSearchSettingsOptions
}>): ResolvedSearchSettings {
  return resolveSearchSettings(
    {
      convo: extractConvoWebSearchOverride(input.convoMeta),
      project: extractProjectWebSearchDefaults(input.projectMeta),
      global: normalizeSearchSettingsLayer(input.globalDefaults),
    },
    input.options
  )
}
