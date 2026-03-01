import {
  OPENROUTER_SAMPLING_PARAM_KEYS,
  OPENROUTER_SAMPLING_PARAM_SPEC_MAP,
  type OpenRouterSamplingParamName,
} from './samplingParamsCatalog'

export type SamplingParamOverride =
  | Readonly<{ mode: 'default' }>
  | Readonly<{ mode: 'custom'; value: number }>

export type SamplingParamsLayer = Readonly<Partial<Record<OpenRouterSamplingParamName, SamplingParamOverride | null>>>

export type SamplingParamsLayers = Readonly<{
  convo?: SamplingParamsLayer | null
  project?: SamplingParamsLayer | null
  global?: SamplingParamsLayer | null
}>

export type OpenRouterSamplingParamsPatch = Readonly<Partial<Record<OpenRouterSamplingParamName, number>>>

export type SamplingParamSource = 'convo' | 'project' | 'global' | 'openrouter_default'

export type ResolvedSamplingParamEntry = Readonly<{
  mode: 'default' | 'custom'
  source: SamplingParamSource
  value?: number
  openRouterDefaultValue?: number
}>

export type ResolvedSamplingParams = Readonly<{
  requestPatch: OpenRouterSamplingParamsPatch
  resolvedByKey: Readonly<Record<OpenRouterSamplingParamName, ResolvedSamplingParamEntry>>
}>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeSamplingParamNumericValue(
  key: OpenRouterSamplingParamName,
  value: unknown
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const spec = OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key]
  const normalized = spec.type === 'int' ? Math.round(value) : value
  if (spec.min !== undefined && normalized < spec.min) return null
  if (spec.max !== undefined && normalized > spec.max) return null
  return normalized
}

export function normalizeSamplingParamOverride(
  key: OpenRouterSamplingParamName,
  raw: unknown
): SamplingParamOverride | undefined {
  if (raw === null || raw === undefined) return undefined

  if (typeof raw === 'number') {
    const normalized = normalizeSamplingParamNumericValue(key, raw)
    return normalized === null ? { mode: 'default' } : { mode: 'custom', value: normalized }
  }

  const record = asRecord(raw)
  if (!record) return undefined

  const mode = record.mode
  if (mode === 'default') return { mode: 'default' }

  if (mode === 'custom') {
    const normalized = normalizeSamplingParamNumericValue(key, record.value)
    return normalized === null ? { mode: 'default' } : { mode: 'custom', value: normalized }
  }

  if ('value' in record) {
    const normalized = normalizeSamplingParamNumericValue(key, record.value)
    return normalized === null ? { mode: 'default' } : { mode: 'custom', value: normalized }
  }

  return undefined
}

export function normalizeSamplingParamsLayer(raw: unknown): SamplingParamsLayer | null {
  const value = asRecord(raw)
  if (!value) return null

  const next: Partial<Record<OpenRouterSamplingParamName, SamplingParamOverride>> = {}
  for (const key of OPENROUTER_SAMPLING_PARAM_KEYS) {
    const normalized = normalizeSamplingParamOverride(key, value[key])
    if (normalized !== undefined) next[key] = normalized
  }
  return Object.keys(next).length > 0 ? next : null
}

export function hasSamplingParamsPatch(raw: unknown): raw is OpenRouterSamplingParamsPatch {
  const value = asRecord(raw)
  if (!value) return false
  return OPENROUTER_SAMPLING_PARAM_KEYS.some((key) => typeof value[key] === 'number')
}

export function resolveSamplingParams(layers: SamplingParamsLayers): ResolvedSamplingParams {
  const convo = normalizeSamplingParamsLayer(layers.convo)
  const project = normalizeSamplingParamsLayer(layers.project)
  const global = normalizeSamplingParamsLayer(layers.global)

  const ordered: ReadonlyArray<Readonly<{ source: 'convo' | 'project' | 'global'; layer: SamplingParamsLayer | null }>> = [
    { source: 'convo', layer: convo },
    { source: 'project', layer: project },
    { source: 'global', layer: global },
  ]

  const requestPatch: Partial<Record<OpenRouterSamplingParamName, number>> = {}
  const resolvedByKey = {} as Record<OpenRouterSamplingParamName, ResolvedSamplingParamEntry>

  for (const key of OPENROUTER_SAMPLING_PARAM_KEYS) {
    let entry: ResolvedSamplingParamEntry = {
      mode: 'default',
      source: 'openrouter_default',
      ...(OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key].defaultValue !== undefined
        ? { openRouterDefaultValue: OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key].defaultValue }
        : {}),
    }

    for (const layerEntry of ordered) {
      const override = layerEntry.layer?.[key]
      if (!override || override.mode === 'default') continue
      entry = {
        mode: 'custom',
        source: layerEntry.source,
        value: override.value,
        ...(OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key].defaultValue !== undefined
          ? { openRouterDefaultValue: OPENROUTER_SAMPLING_PARAM_SPEC_MAP[key].defaultValue }
          : {}),
      }
      requestPatch[key] = override.value
      break
    }

    resolvedByKey[key] = entry
  }

  return {
    requestPatch,
    resolvedByKey,
  }
}
