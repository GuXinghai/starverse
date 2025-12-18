import type { ReasoningModelIndexItem } from './reasoningModelIndexTypes'

export function selectReasoningModelIndexVisible(items: readonly ReasoningModelIndexItem[]): ReasoningModelIndexItem[] {
  return items.filter((m) => m.status === 'visible')
}

export function selectReasoningModelIndexAll(items: readonly ReasoningModelIndexItem[]): ReasoningModelIndexItem[] {
  return [...items]
}

