import { decodeImageGenerationDefaultResponse } from '@/next/ipc/contracts/dbBridgeContracts'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'imageGenerationDefault'

export async function getImageGenerationDefault(): Promise<unknown | null> {
  return decodeImageGenerationDefaultResponse({ value: (await getGenerationV2UiPreference(KEY)) ?? null })
}

export async function setImageGenerationDefault(value: unknown): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, value)
}
