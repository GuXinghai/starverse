import { GENERATION_PARAM_KEYS } from './generationParamCatalog'
import {
  normalizeGenerationParamsLayer,
  resolveGenerationParamsFromLayers,
} from './generationParamResolver'
import type {
  GenerationParamKey,
  GenerationParamsLayer,
  ProviderGenerationParamProfile,
  ResolvedGenerationParams,
} from './generationParamTypes'

export { normalizeGenerationParamsLayer } from './generationParamResolver'

export const PROJECT_GENERATION_PARAMS_DEFAULTS_META_KEY = 'generationParamsDefaults'
export const CONVO_GENERATION_PARAMS_OVERRIDE_META_KEY = 'generationParamsOverride'
export const STORED_GENERATION_PARAMS_VERSION = 1

export type StoredGenerationParamsLayer = Readonly<{
  version: 1
  params: GenerationParamsLayer
}>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function unwrapStoredLayer(raw: unknown): unknown {
  const record = asRecord(raw)
  if (!record) return raw
  if (record.version === STORED_GENERATION_PARAMS_VERSION && 'params' in record) return record.params
  return raw
}

export function normalizeStoredGenerationParamsLayer(raw: unknown): StoredGenerationParamsLayer | null {
  const normalized = normalizeGenerationParamsLayer(unwrapStoredLayer(raw))
  if (!normalized) return null

  const compact: Partial<Record<GenerationParamKey, GenerationParamsLayer[GenerationParamKey]>> = {}
  for (const key of GENERATION_PARAM_KEYS) {
    const setting = normalized[key]
    if (!setting || setting.mode === 'inherit') continue
    compact[key] = setting
  }
  return Object.keys(compact).length > 0
    ? { version: STORED_GENERATION_PARAMS_VERSION, params: compact }
    : null
}

export function extractProjectGenerationParamsDefaults(meta: unknown): GenerationParamsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeGenerationParamsLayer(unwrapStoredLayer(root[PROJECT_GENERATION_PARAMS_DEFAULTS_META_KEY]))
}

export function extractConvoGenerationParamsOverride(meta: unknown): GenerationParamsLayer | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeGenerationParamsLayer(unwrapStoredLayer(root[CONVO_GENERATION_PARAMS_OVERRIDE_META_KEY]))
}

export function mergeProjectGenerationParamsDefaultsMeta(
  meta: unknown,
  layer: GenerationParamsLayer | null,
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const compact = normalizeStoredGenerationParamsLayer(layer)
  if (compact) next[PROJECT_GENERATION_PARAMS_DEFAULTS_META_KEY] = compact
  else delete next[PROJECT_GENERATION_PARAMS_DEFAULTS_META_KEY]
  return next
}

export function mergeConvoGenerationParamsOverrideMeta(
  meta: unknown,
  layer: GenerationParamsLayer | null,
): Record<string, unknown> {
  const root = asRecord(meta)
  const next: Record<string, unknown> = root ? { ...root } : {}
  const compact = normalizeStoredGenerationParamsLayer(layer)
  if (compact) next[CONVO_GENERATION_PARAMS_OVERRIDE_META_KEY] = compact
  else delete next[CONVO_GENERATION_PARAMS_OVERRIDE_META_KEY]
  return next
}

export function resolveGenerationParamsFromStoredLayers(input: Readonly<{
  profile: ProviderGenerationParamProfile
  modelId?: string | null
  convoMeta?: unknown
  projectMeta?: unknown
  globalDefaults?: unknown
}>): ResolvedGenerationParams {
  return resolveGenerationParamsFromLayers({
    profile: input.profile,
    modelId: input.modelId,
    layers: {
      conversation: extractConvoGenerationParamsOverride(input.convoMeta),
      project: extractProjectGenerationParamsDefaults(input.projectMeta),
      global: normalizeGenerationParamsLayer(unwrapStoredLayer(input.globalDefaults)),
    },
  })
}
