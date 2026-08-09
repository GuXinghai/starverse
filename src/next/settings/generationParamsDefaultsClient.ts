import { decodeGenerationParamsDefaultsResponse } from '@/next/ipc/contracts/dbBridgeContracts'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'generationParamsDefaults'

export async function getGenerationParamsDefaults(): Promise<unknown | null> {
  return decodeGenerationParamsDefaultsResponse({ value: (await getGenerationV2UiPreference(KEY)) ?? null })
}

export async function setGenerationParamsDefaults(value: unknown): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, value)
}
