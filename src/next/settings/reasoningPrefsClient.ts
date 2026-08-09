import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'reasoningPrefs'

export async function getReasoningPrefs(): Promise<unknown | null> {
  return (await getGenerationV2UiPreference(KEY)) ?? null
}

export async function setReasoningPrefs(value: unknown): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, value)
}
