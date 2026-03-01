import {
  OPENROUTER_SAMPLING_PARAM_KEYS,
  type OpenRouterSamplingParamName,
} from './samplingParamsCatalog'
import {
  normalizeSamplingParamsLayer,
  resolveSamplingParams,
  type ResolvedSamplingParams,
  type SamplingParamsLayer,
} from './samplingParamsResolver'

export { normalizeSamplingParamsLayer } from './samplingParamsResolver'

export const PROJECT_SAMPLING_PARAMS_DEFAULTS_META_KEY = 'samplingParamsDefaults'
export const CONVO_SAMPLING_PARAMS_OVERRIDE_META_KEY = 'samplingParamsOverride'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function compactLayerForStorage(layer: SamplingParamsLayer | null): SamplingParamsLayer | null {
  const normalized = normalizeSamplingParamsLayer(layer)
  if (!normalized) return null

  const next: Partial<Record<OpenRouterSamplingParamName, SamplingParamsLayer[OpenRouterSamplingParamName]>> = {}
  for (const key of OPENROUTER_SAMPLING_PARAM_KEYS) {
    const override = normalized[key]
    if (override?.mode === 'custom') next[key] = override
  }
  return Object.keys(next).length > 0 ? next : null
}

export function extractProjectSamplingParamsDefaults(meta: unknown): SamplingParamsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeSamplingParamsLayer(root[PROJECT_SAMPLING_PARAMS_DEFAULTS_META_KEY])
}

export function extractConvoSamplingParamsOverride(meta: unknown): SamplingParamsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeSamplingParamsLayer(root[CONVO_SAMPLING_PARAMS_OVERRIDE_META_KEY])
}

export function mergeProjectSamplingParamsDefaultsMeta(
  meta: unknown,
  layer: SamplingParamsLayer | null
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const compact = compactLayerForStorage(layer)
  if (compact) next[PROJECT_SAMPLING_PARAMS_DEFAULTS_META_KEY] = compact
  else delete next[PROJECT_SAMPLING_PARAMS_DEFAULTS_META_KEY]
  return next
}

export function mergeConvoSamplingParamsOverrideMeta(
  meta: unknown,
  layer: SamplingParamsLayer | null
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const compact = compactLayerForStorage(layer)
  if (compact) next[CONVO_SAMPLING_PARAMS_OVERRIDE_META_KEY] = compact
  else delete next[CONVO_SAMPLING_PARAMS_OVERRIDE_META_KEY]
  return next
}

export function resolveSamplingParamsFromStoredLayers(input: Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalDefaults?: unknown
}>): ResolvedSamplingParams {
  return resolveSamplingParams({
    convo: extractConvoSamplingParamsOverride(input.convoMeta),
    project: extractProjectSamplingParamsDefaults(input.projectMeta),
    global: normalizeSamplingParamsLayer(input.globalDefaults),
  })
}
