import {
  decodeGenerationIntentLayerV2,
  type GenerationIntentLayerV2,
} from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { decodeTargetThinkingPreferencesV2, type TargetThinkingPreferencesV2 } from './targetThinkingPreferencesV2'
import { decodeTargetImagePreferencesV2, type TargetImagePreferencesV2 } from './targetImagePreferencesV2'

export type GenerationConfigLayerV2 = Omit<GenerationIntentLayerV2, 'attachments'> &
  Readonly<{ attachments?: never; targetThinkingPreferences?: TargetThinkingPreferencesV2; targetImagePreferences?: TargetImagePreferencesV2 }>

export class GenerationConfigLayerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG') {
    super(code)
    this.name = 'GenerationConfigLayerV2Error'
  }
}

export function decodeGenerationConfigLayerV2(value: unknown): GenerationConfigLayerV2 {
  const raw = value as Record<string, unknown>
  const { targetThinkingPreferences, targetImagePreferences, ...intent } = raw ?? {}
  const decoded = decodeGenerationIntentLayerV2(intent)
  if (decoded.attachments !== undefined) {
    throw new GenerationConfigLayerV2Error('GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG')
  }
  const { attachments: _attachments, ...configLayer } = decoded
  return Object.freeze({ ...configLayer, ...(targetThinkingPreferences === undefined ? {} : { targetThinkingPreferences: decodeTargetThinkingPreferencesV2(targetThinkingPreferences) }),
    ...(targetImagePreferences === undefined ? {} : { targetImagePreferences: decodeTargetImagePreferencesV2(targetImagePreferences) }) })
}

export function projectGenerationConfigLayerV2(value: GenerationConfigLayerV2): Readonly<Record<string, unknown>> {
  return { ...projectGenerationIntentLayerV2(value), ...(value.targetThinkingPreferences === undefined ? {} : { targetThinkingPreferences: value.targetThinkingPreferences }),
    ...(value.targetImagePreferences === undefined ? {} : { targetImagePreferences: value.targetImagePreferences }) }
}
