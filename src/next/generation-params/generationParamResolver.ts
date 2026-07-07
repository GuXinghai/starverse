import { GENERATION_PARAM_KEYS } from './generationParamCatalog'
import { getEffectiveGenerationParamCapabilities } from './generationParamProfiles'
import {
  makeGenerationParamError,
  makeGenerationParamWarning,
  normalizeGenerationParamValue,
} from './generationParamValidation'
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

function decision(
  key: GenerationParamKey,
  state: GenerationParamDecisionState,
  extra: Omit<GenerationParamDecision, 'key' | 'state'> = {},
): GenerationParamDecision {
  return { key, state, ...extra }
}

export function resolveGenerationParamsFromLayers(input: ResolveGenerationParamsInput): ResolvedGenerationParams {
  const capabilities = getEffectiveGenerationParamCapabilities(input.profile, input.modelId)
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

    const capability = capabilities[key]
    if (!capability) {
      decisions[key] = decision(key, 'unsupported', { source, value: setting.value, reason: 'Provider profile has no capability for this parameter.' })
      warnings.push(makeGenerationParamWarning('unsupported_param', `${key} is not supported by ${input.profile.profileId}.`, key))
      continue
    }

    if (!capability.supported) {
      decisions[key] = decision(key, 'unsupported', {
        source,
        value: setting.value,
        reason: capability.ui?.warning ?? `${key} is unsupported.`,
      })
      warnings.push(makeGenerationParamWarning(
        'unsupported_param',
        capability.ui?.warning ?? `${key} cannot be sent for ${input.profile.profileId}.`,
        key,
      ))
      continue
    }

    const normalized = normalizeGenerationParamValue(key, setting.value, capability)
    if (normalized === null) {
      decisions[key] = decision(key, 'rejected', { source, value: setting.value, reason: 'Invalid value for capability.' })
      errors.push(makeGenerationParamError('invalid_value', `${key} has an invalid value for ${input.profile.profileId}.`, key))
      continue
    }

    if (input.profile.providerId === 'openai_responses' && key === 'reasoningEffort' && normalized === 'auto') {
      decisions[key] = decision(key, 'providerAuto', {
        source,
        value: normalized,
        reason: 'OpenAI Responses provider auto: reasoning.effort is omitted.',
      })
      continue
    }

    const advisoryState = capability.status === 'rejected' || capability.status === 'noEffect'
      ? capability.status
      : null
    const isDeprecated = capability.status === 'deprecated'
    requestParams[key] = normalized
    decisions[key] = decision(key, advisoryState ?? (isDeprecated ? 'deprecated' : 'sent'), {
      source,
      value: normalized,
      ...(advisoryState ? { reason: capability.ui?.warning ?? `${key} is ${advisoryState}.` } : {}),
      ...(isDeprecated ? { reason: capability.ui?.warning ?? `${key} is deprecated.` } : {}),
    })
    if (isDeprecated) {
      warnings.push(makeGenerationParamWarning('deprecated_param', capability.ui?.warning ?? `${key} is deprecated.`, key))
    }
    if (advisoryState === 'rejected') {
      warnings.push(makeGenerationParamWarning('rejected_param', capability.ui?.warning ?? `${key} may be rejected by ${input.profile.profileId}.`, key))
    }
    if (advisoryState === 'noEffect') {
      warnings.push(makeGenerationParamWarning('no_effect_param', capability.ui?.warning ?? `${key} may have no effect for ${input.profile.profileId}.`, key))
    }
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
