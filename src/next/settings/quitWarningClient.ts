import { QUIT_WARNING_PREFERENCE_KEY, normalizeStoredQuitWarningEnabled } from '@/shared/settings/quitWarningPreference'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

export async function getQuitWarningEnabled(): Promise<boolean> {
  return normalizeStoredQuitWarningEnabled(await getGenerationV2UiPreference(QUIT_WARNING_PREFERENCE_KEY))
}

export async function setQuitWarningEnabled(value: boolean): Promise<boolean> {
  return setGenerationV2UiPreference(QUIT_WARNING_PREFERENCE_KEY, value === true)
}
