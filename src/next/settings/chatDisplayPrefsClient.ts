import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'chatReasoningDisplayMode'

export async function getChatReasoningDisplayMode(): Promise<'inline' | 'rail'> {
  const value = await getGenerationV2UiPreference(KEY)
  return value === 'rail' ? 'rail' : 'inline'
}

export async function setChatReasoningDisplayMode(value: 'inline' | 'rail'): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, value)
}
