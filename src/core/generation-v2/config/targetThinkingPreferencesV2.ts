import { decodeGenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'

export type ThinkingTargetV2 = Readonly<{ providerId: string; endpointProfileId: string; protocolContractId: string; operation: string; modelId: string }>
export type TargetThinkingPreferencesV2 = Readonly<{
  currentKey: string
  values: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  unscoped?: Readonly<Record<string, unknown>>
}>
export function thinkingTargetKeyV2(binding: ThinkingTargetV2): string {
  return JSON.stringify([binding.providerId, binding.endpointProfileId, binding.protocolContractId, binding.operation, binding.modelId])
}
export function thinkingTargetFromProjectionV2(binding: Readonly<Record<string, unknown>>): ThinkingTargetV2 {
  const keys = ['providerId', 'endpointProfileId', 'protocolContractId', 'operation', 'modelId'] as const
  if (keys.some(key => typeof binding[key] !== 'string' || !(binding[key] as string).length)) throw new Error('GENERATION_V2_TARGET_THINKING_INVALID')
  return Object.fromEntries(keys.map(key => [key, binding[key]])) as ThinkingTargetV2
}
function entry(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['reasoning', 'providerExtension'].includes(key))) throw new Error('GENERATION_V2_TARGET_THINKING_INVALID')
  const projected = projectGenerationIntentLayerV2(decodeGenerationIntentLayerV2({ schemaVersion: 2, ...value }))
  const { schemaVersion: _, ...result } = projected
  return Object.freeze(result)
}
export function decodeTargetThinkingPreferencesV2(value: unknown): TargetThinkingPreferencesV2 {
  const raw = value as TargetThinkingPreferencesV2
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['currentKey', 'values', 'unscoped'].includes(key)) ||
      typeof raw.currentKey !== 'string' || !raw.values || typeof raw.values !== 'object' || Array.isArray(raw.values) || Object.keys(raw.values).length > 512) throw new Error('GENERATION_V2_TARGET_THINKING_INVALID')
  const values: Record<string, Readonly<Record<string, unknown>>> = Object.create(null)
  for (const [key, value] of Object.entries(raw.values)) {
    const parts = JSON.parse(key)
    if (!Array.isArray(parts) || parts.length !== 5 || parts.some(value => typeof value !== 'string' || !value.length || value.length > 512) || JSON.stringify(parts) !== key) throw new Error('GENERATION_V2_TARGET_THINKING_INVALID')
    values[key] = entry(value)
  }
  if (!Object.hasOwn(values, raw.currentKey)) throw new Error('GENERATION_V2_TARGET_THINKING_INVALID')
  return Object.freeze({ currentKey: raw.currentKey, values: Object.freeze(values), ...(raw.unscoped === undefined ? {} : { unscoped: entry(raw.unscoped) }) })
}

/** Unknown origin is retained for inspection, never guessed to be a new target's native settings. */
export function rememberTargetThinkingV2(previous: Readonly<Record<string, unknown>>, next: Readonly<Record<string, unknown>>, binding: ThinkingTargetV2) {
  const key = thinkingTargetKeyV2(binding)
  const old = previous.targetThinkingPreferences === undefined ? undefined : decodeTargetThinkingPreferencesV2(previous.targetThinkingPreferences)
  const take = (layer: Readonly<Record<string, unknown>>) => entry({ ...(layer.reasoning === undefined ? {} : { reasoning: layer.reasoning }), ...(layer.providerExtension === undefined ? {} : { providerExtension: layer.providerExtension }) })
  return { ...next, targetThinkingPreferences: decodeTargetThinkingPreferencesV2({ currentKey: key,
    values: { ...old?.values, [key]: take(next) }, unscoped: old?.unscoped ?? take(previous) }) }
}

export function selectTargetThinkingV2(layer: Readonly<Record<string, unknown>>, binding?: ThinkingTargetV2): Readonly<Record<string, unknown>> {
  if (!binding || layer.targetThinkingPreferences === undefined) return layer
  const prefs = decodeTargetThinkingPreferencesV2(layer.targetThinkingPreferences)
  const key = thinkingTargetKeyV2(binding)
  const selected = prefs.values[key]
  if (selected) return { ...layer, ...selected }
  // Keep common intent for request adaptation, but native extensions belong to their recorded target.
  return { ...layer, providerExtension: { kind: 'none' } }
}
