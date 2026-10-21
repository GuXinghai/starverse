import { decodeGenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import type { ThinkingTargetV2 } from './targetThinkingPreferencesV2'

type ImagePreference = Readonly<{ enabled: boolean; image: Readonly<Record<string, unknown>> }>
export type TargetImagePreferencesV2 = Readonly<{
  currentKey: string
  values: Readonly<Record<string, ImagePreference>>
}>

// Image controls belong to the provider endpoint. Switching Gemini models
// reuses the choice and lets the new model's resolved domain reset it.
const targetKey = (target: ThinkingTargetV2) => JSON.stringify([
  target.providerId, target.endpointProfileId,
])
function invalid(): never { throw new Error('GENERATION_V2_TARGET_IMAGE_INVALID') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function image(value: unknown): Readonly<Record<string, unknown>> {
  const decoded = decodeGenerationIntentLayerV2({ schemaVersion: 2, image: value })
  if (!decoded.image || decoded.image.mode !== 'generate') return invalid()
  return projectGenerationIntentLayerV2(decoded).image as Readonly<Record<string, unknown>>
}
export function decodeTargetImagePreferencesV2(value: unknown): TargetImagePreferencesV2 {
  const raw = record(value), rawValues = record(raw.values)
  if (Object.keys(raw).some(key => !['currentKey', 'values'].includes(key)) ||
      typeof raw.currentKey !== 'string' || Object.keys(rawValues).length > 512) return invalid()
  const values: Record<string, ImagePreference> = Object.create(null)
  for (const [key, item] of Object.entries(rawValues)) {
    let parts: unknown
    try { parts = JSON.parse(key) } catch { return invalid() }
    if (!Array.isArray(parts) || parts.length !== 2 || parts.some(part =>
      typeof part !== 'string' || !part.length || part.length > 512) || JSON.stringify(parts) !== key) return invalid()
    const entry = record(item)
    if (Object.keys(entry).some(key => !['enabled', 'image'].includes(key)) || typeof entry.enabled !== 'boolean') return invalid()
    values[key] = Object.freeze({ enabled: entry.enabled, image: image(entry.image) })
  }
  if (!Object.hasOwn(values, raw.currentKey)) return invalid()
  return Object.freeze({ currentKey: raw.currentKey, values: Object.freeze(values) })
}
export function rememberTargetImageV2(previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>, target: ThinkingTargetV2): Readonly<Record<string, unknown>> {
  const key = targetKey(target)
  const old = previous.targetImagePreferences === undefined ? undefined : decodeTargetImagePreferencesV2(previous.targetImagePreferences)
  const active = record(next.image ?? { mode: 'disabled' })
  const enabled = active.mode === 'generate'
  const preference = Object.freeze({ enabled,
    image: enabled ? image(active) : old?.values[key]?.image ?? image({ mode: 'generate' }) })
  return { ...next, targetImagePreferences: decodeTargetImagePreferencesV2({ currentKey: key,
    values: { ...old?.values, [key]: preference } }) }
}
export function readTargetImagePreferenceV2(layer: Readonly<Record<string, unknown>>,
  target?: ThinkingTargetV2, providerId?: string | null): ImagePreference | undefined {
  if (layer.targetImagePreferences === undefined) return undefined
  const prefs = decodeTargetImagePreferencesV2(layer.targetImagePreferences)
  if (target) return prefs.values[targetKey(target)]
  if (!providerId) return prefs.values[prefs.currentKey]
  const current = JSON.parse(prefs.currentKey) as string[]
  if (current[0] === providerId) return prefs.values[prefs.currentKey]
  const matches = Object.entries(prefs.values).filter(([key]) => JSON.parse(key)[0] === providerId)
  return matches.length === 1 ? matches[0][1] : undefined
}
export function selectTargetImageV2(layer: Readonly<Record<string, unknown>>,
  target?: ThinkingTargetV2, providerId?: string | null): Readonly<Record<string, unknown>> {
  if (layer.targetImagePreferences === undefined) return layer
  const preference = readTargetImagePreferenceV2(layer, target, providerId)
  return { ...layer, image: preference?.enabled ? preference.image : { mode: 'disabled' } }
}
