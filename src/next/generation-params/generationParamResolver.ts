import { GENERATION_PARAM_KEYS } from './generationParamCatalog'
import { makeGenerationParamWarning } from './generationParamValidation'
import type {
  GenerationParamDecision,
  GenerationParamDecisionState,
  GenerationParamKey,
  GenerationParamSetting,
  GenerationParamSource,
  GenerationParamsLayer,
  GenerationParamsLayers,
  ResolvedGenerationParams,
  ResolveGenerationParamsInput,
} from './generationParamTypes'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeGenerationParamSetting(raw: unknown): GenerationParamSetting | undefined {
  if (raw === null || raw === undefined) return undefined
  const record = asRecord(raw)
  if (!record) return undefined
  if (record.mode === 'inherit') return { mode: 'inherit' }
  if (record.mode === 'omit') return { mode: 'omit' }
  if (record.mode === 'custom') return { mode: 'custom', value: record.value as any }
  return undefined
}

export function normalizeGenerationParamsLayer(raw: unknown): GenerationParamsLayer | null {
  const record = asRecord(raw)
  if (!record) return null
  const next: Partial<Record<GenerationParamKey, GenerationParamSetting>> = {}
  for (const key of GENERATION_PARAM_KEYS) {
    const normalized = normalizeGenerationParamSetting(record[key])
    if (normalized) next[key] = normalized
  }
  return Object.keys(next).length > 0 ? next : null
}

function layerSetting(layer: GenerationParamsLayer | null | undefined, key: GenerationParamKey): GenerationParamSetting | null {
  return normalizeGenerationParamSetting(layer?.[key]) ?? null
}

function resolveRawSetting(
  layers: GenerationParamsLayers,
  key: GenerationParamKey,
): Readonly<{ setting: GenerationParamSetting | null; source?: GenerationParamSource }> {
  const ordered: readonly Readonly<{ source: GenerationParamSource; layer?: GenerationParamsLayer | null }>[] = [
    { source: 'conversation', layer: layers.conversation },
    { source: 'project', layer: layers.project },
    { source: 'global', layer: layers.global },
  ]
  for (const item of ordered) {
    const setting = layerSetting(item.layer, key)
    if (!setting || setting.mode === 'inherit') continue
    return { setting, source: item.source }
  }
  return { setting: null }
}

/**
 * Resolves only layer precedence for Generation V2 semantic construction.
 * Capability support, value domains and provider-specific legality belong to
 * the resolved capability validator, so this helper deliberately does not
 * normalize, reject, or substitute custom values.
 */
export function resolveGenerationParamValuesFromLayers(input: Readonly<{
  layers: GenerationParamsLayers
}>): Readonly<Partial<Record<GenerationParamKey, unknown>>> {
  const values: Partial<Record<GenerationParamKey, unknown>> = {}
  for (const key of GENERATION_PARAM_KEYS) {
    const { setting } = resolveRawSetting(input.layers, key)
    if (setting?.mode === 'custom') values[key] = setting.value
  }
  return Object.freeze(values)
}

function decision(
  key: GenerationParamKey,
  state: GenerationParamDecisionState,
  extra: Omit<GenerationParamDecision, 'key' | 'state'> = {},
): GenerationParamDecision {
  return { key, state, ...extra }
}

export function resolveGenerationParamsFromLayers(input: ResolveGenerationParamsInput): ResolvedGenerationParams {
  const requestParams: ResolvedGenerationParams['requestParams'] = {}
  const decisions: ResolvedGenerationParams['decisions'] = {}
  const warnings: ResolvedGenerationParams['warnings'] = []
  const errors: ResolvedGenerationParams['errors'] = []

  for (const key of GENERATION_PARAM_KEYS) {
    const { setting, source } = resolveRawSetting(input.layers, key)
    if (!setting) {
      decisions[key] = decision(key, 'inheritedToAbsent')
      continue
    }

    if (setting.mode === 'omit') {
      decisions[key] = decision(key, 'omitted', { source })
      continue
    }
    if (setting.mode !== 'custom') {
      decisions[key] = decision(key, 'inheritedToAbsent')
      continue
    }

    const value = setting.value
    requestParams[key] = value
    decisions[key] = decision(key, 'sent', {
      source,
      value,
    })
  }

  const sentTemperature = requestParams.temperature !== undefined
  const sentTopP = requestParams.topP !== undefined
  if (sentTemperature && sentTopP) {
    warnings.push(makeGenerationParamWarning(
      'conflict_group',
      'temperature and topP are both custom; providers commonly recommend changing only one.',
    ))
  }

  return { requestParams, decisions, warnings, errors }
}
