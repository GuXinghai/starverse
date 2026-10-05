import { GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY, isValidGenerationTotalTimeoutPreferenceMs,
  normalizeStoredGenerationTotalTimeoutMs } from '@/shared/settings/generationTotalTimeoutPreference'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

/** `null` = Unlimited (default). */
export async function getGenerationTotalTimeoutMs(): Promise<number | null> {
  return normalizeStoredGenerationTotalTimeoutMs(await getGenerationV2UiPreference(GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY))
}

export async function setGenerationTotalTimeoutMs(value: number | null): Promise<boolean> {
  if (!isValidGenerationTotalTimeoutPreferenceMs(value)) return false
  return setGenerationV2UiPreference(GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY, value)
}
