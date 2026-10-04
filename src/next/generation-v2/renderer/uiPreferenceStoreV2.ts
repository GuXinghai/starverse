/**
 * V2 user-interface preferences live in the retained Electron config store,
 * not in the retired chat database.  This bridge deliberately has no access
 * to provider credentials, conversation data, or generation snapshots.
 */
import { GENERATION_V2_UI_PREFERENCE_NAMESPACE as UI_PREFERENCE_NAMESPACE,
  GENERATION_V2_UI_PREFERENCE_KEYS } from '../../../shared/settings/generationV2UiPreferenceKeys'

type ElectronStoreBridgeV2 = Readonly<{
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<unknown>
}>

function bridge(): ElectronStoreBridgeV2 | null {
  const value = (globalThis as { electronStore?: unknown }).electronStore
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ElectronStoreBridgeV2>
  return typeof candidate.get === 'function' && typeof candidate.set === 'function'
    ? candidate as ElectronStoreBridgeV2
    : null
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return Object.freeze({})
  }
  return Object.freeze(Object.fromEntries(Object.entries(value)))
}

export async function getGenerationV2UiPreference(key: string): Promise<unknown> {
  const store = bridge()
  if (!store) return undefined
  try { return record(await store.get(UI_PREFERENCE_NAMESPACE))[key] } catch { return undefined }
}

export async function setGenerationV2UiPreference(key: string, value: unknown): Promise<boolean> {
  const store = bridge()
  if (!store || !GENERATION_V2_UI_PREFERENCE_KEYS.has(key)) return false
  try {
    return await store.set(`${UI_PREFERENCE_NAMESPACE}.${key}`, value) === true
  } catch { return false }
}
