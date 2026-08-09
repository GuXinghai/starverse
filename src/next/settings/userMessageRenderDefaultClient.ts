import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'userMessageRenderDefault'

export async function getUserMessageRenderDefault(): Promise<boolean | null> {
  const value = await getGenerationV2UiPreference(KEY)
  return typeof value === 'boolean' ? value : null
}

export async function setUserMessageRenderDefault(value: boolean): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, value)
}
