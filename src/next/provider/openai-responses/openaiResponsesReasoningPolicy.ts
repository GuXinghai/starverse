/**
 * UI-only labels for the Responses control. Model-specific effort support is
 * deliberately absent here; the resolved capability projection owns the
 * allowed domain and the omission state represents provider auto behavior.
 */
export type OpenAIResponsesReasoningEffort = string
export type OpenAIResponsesReasoningEffortSetting = 'auto' | string
export type OpenAIResponsesReasoningSummarySetting = 'off' | 'auto' | 'concise' | 'detailed'

export function formatOpenAIResponsesAutoReasoningLabel(
  _modelId: string | null | undefined,
  fallback = 'Auto',
): string {
  return fallback
}
