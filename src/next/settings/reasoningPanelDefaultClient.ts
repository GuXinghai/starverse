import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const EXPANDED_KEY = 'chatReasoningPanelDefaultExpanded'
const AUTO_COLLAPSE_KEY = 'chatReasoningPanelAutoCollapseAfterReasoning'

export async function getChatReasoningPanelDefaultExpanded(): Promise<boolean> {
  const value = await getGenerationV2UiPreference(EXPANDED_KEY)
  return typeof value === 'boolean' ? value : true
}

export async function setChatReasoningPanelDefaultExpanded(value: boolean): Promise<boolean> {
  return setGenerationV2UiPreference(EXPANDED_KEY, value)
}

export async function getChatReasoningPanelAutoCollapseAfterReasoning(): Promise<boolean> {
  const value = await getGenerationV2UiPreference(AUTO_COLLAPSE_KEY)
  return value === true
}

export async function setChatReasoningPanelAutoCollapseAfterReasoning(value: boolean): Promise<boolean> {
  return setGenerationV2UiPreference(AUTO_COLLAPSE_KEY, value)
}
