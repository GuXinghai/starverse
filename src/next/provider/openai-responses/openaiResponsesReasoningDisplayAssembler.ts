import type { ReasoningDisplayBlock } from '@/next/state/types'
import { createReasoningTextDisplayBlock } from '@/next/provider/reasoningDisplayBlock'

export type OpenAIResponsesReasoningEvent = Readonly<{
  type: string
  [key: string]: unknown
}>

export type OpenAIResponsesReasoningDisplayAssemblerState = {
  emittedSummaryKeys: Set<string>
  streamedSummaryTextByItemKey: Map<string, string>
  displayTextByPartKey?: Map<string, string>
}

type TextRole = Extract<ReasoningDisplayBlock, { type: 'text' }>['semanticRole']

const SUMMARY_ORDINAL_BASE = 0
const REASONING_TEXT_ORDINAL_BASE = 500_000

export function createOpenAIResponsesReasoningDisplayAssemblerState(): OpenAIResponsesReasoningDisplayAssemblerState {
  return {
    emittedSummaryKeys: new Set(),
    streamedSummaryTextByItemKey: new Map(),
    displayTextByPartKey: new Map(),
  }
}

export function appendOpenAIResponsesReasoningDelta(input: Readonly<{
  event: OpenAIResponsesReasoningEvent
  messageId: string
  state?: OpenAIResponsesReasoningDisplayAssemblerState
  semanticRole: Exclude<TextRole, undefined>
}>): ReasoningDisplayBlock | null {
  const delta = typeof input.event.delta === 'string' ? input.event.delta : ''
  if (delta.length === 0) return null

  const part = resolvePartIdentity(input.event, input.semanticRole, 0)
  const previous = getDisplayTextByPartKey(input.state).get(part.partKey) ?? ''
  const nextText = `${previous}${delta}`
  getDisplayTextByPartKey(input.state).set(part.partKey, nextText)

  if (input.semanticRole === 'summary') {
    markStreamedSummary(input.event, delta, nextText, input.state)
  }

  return createReasoningTextDisplayBlock({
    messageId: input.messageId,
    providerKey: 'openai-responses',
    ordinal: part.ordinal,
    text: nextText,
    semanticRole: input.semanticRole,
    sourceEventType: input.event.type,
    blockIdSuffix: part.partKey,
  })
}

export function buildOpenAIResponsesFinalSummaryDisplayBlocks(input: Readonly<{
  event: OpenAIResponsesReasoningEvent
  item: Record<string, unknown>
  messageId: string
  summaryTexts: readonly string[]
  state?: OpenAIResponsesReasoningDisplayAssemblerState
}>): ReasoningDisplayBlock[] {
  if (input.summaryTexts.length === 0) return []

  const itemKey = resolveReasoningSummaryItemKey(input.event, input.item)
  if (itemKey && input.state?.streamedSummaryTextByItemKey.has(itemKey)) {
    return []
  }

  const blocks: ReasoningDisplayBlock[] = []
  input.summaryTexts.forEach((text, index) => {
    if (isDuplicateFinalSummaryText(input.event, input.item, text, input.state)) return
    const part = resolvePartIdentity(input.event, 'summary', index)
    const block = createReasoningTextDisplayBlock({
      messageId: input.messageId,
      providerKey: 'openai-responses',
      ordinal: part.ordinal,
      text,
      semanticRole: 'summary',
      sourceEventType: input.event.type,
      blockIdSuffix: `${part.partKey}:final:${index}`,
    })
    if (block) {
      blocks.push(block)
      markFinalSummaryEmitted(input.event, input.item, text, input.state)
    }
  })
  return blocks
}

function getDisplayTextByPartKey(
  state: OpenAIResponsesReasoningDisplayAssemblerState | undefined
): Map<string, string> {
  if (!state) return new Map()
  if (!state.displayTextByPartKey) state.displayTextByPartKey = new Map()
  return state.displayTextByPartKey
}

function markStreamedSummary(
  event: OpenAIResponsesReasoningEvent,
  delta: string,
  fullText: string,
  state: OpenAIResponsesReasoningDisplayAssemblerState | undefined,
): void {
  if (!state) return
  const itemKey = resolveReasoningSummaryItemKey(event)
  if (itemKey) {
    state.streamedSummaryTextByItemKey.set(itemKey, fullText)
    state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(fullText, itemKey))
    state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(delta, itemKey))
  }
  state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(fullText, null))
  state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(delta, null))
}

function markFinalSummaryEmitted(
  event: OpenAIResponsesReasoningEvent,
  item: Record<string, unknown>,
  text: string,
  state: OpenAIResponsesReasoningDisplayAssemblerState | undefined,
): void {
  if (!state) return
  const itemKey = resolveReasoningSummaryItemKey(event, item)
  if (itemKey) state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(text, itemKey))
  state.emittedSummaryKeys.add(buildReasoningSummaryDedupeKey(text, null))
}

function isDuplicateFinalSummaryText(
  event: OpenAIResponsesReasoningEvent,
  item: Record<string, unknown>,
  text: string,
  state: OpenAIResponsesReasoningDisplayAssemblerState | undefined,
): boolean {
  if (!state) return false
  const itemKey = resolveReasoningSummaryItemKey(event, item)
  if (itemKey) {
    const streamedText = state.streamedSummaryTextByItemKey.get(itemKey)
    if (streamedText !== undefined) return true
    if (state.emittedSummaryKeys.has(buildReasoningSummaryDedupeKey(text, itemKey))) return true
  }
  return state.emittedSummaryKeys.has(buildReasoningSummaryDedupeKey(text, null))
}

function resolvePartIdentity(
  event: OpenAIResponsesReasoningEvent,
  semanticRole: Exclude<TextRole, undefined>,
  fallbackIndex: number,
): Readonly<{ partKey: string; ordinal: number }> {
  const itemKey = resolveReasoningSummaryItemKey(event) ?? resolveOutputKey(event)
  const index = firstNonNegativeInteger(event.summary_index, event.content_index, fallbackIndex) ?? 0
  const kind = semanticRole === 'summary' ? 'summary' : 'reasoning_text'
  const outputIndex = firstNonNegativeInteger(event.output_index, 0) ?? 0
  const base = semanticRole === 'summary' ? SUMMARY_ORDINAL_BASE : REASONING_TEXT_ORDINAL_BASE
  return {
    partKey: `${kind}:${itemKey}:${index}`,
    ordinal: base + outputIndex * 1000 + index,
  }
}

function resolveOutputKey(event: OpenAIResponsesReasoningEvent): string {
  const outputIndex = firstNonNegativeInteger(event.output_index, 0) ?? 0
  return `output:${outputIndex}`
}

function resolveReasoningSummaryItemKey(
  event: OpenAIResponsesReasoningEvent,
  item?: Record<string, unknown>,
): string | null {
  if (typeof item?.id === 'string' && item.id.trim()) return item.id.trim()
  if (typeof event.item_id === 'string' && event.item_id.trim()) return event.item_id.trim()
  return null
}

function firstNonNegativeInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  }
  return null
}

function buildReasoningSummaryDedupeKey(text: string, itemKey: string | null): string {
  return `${itemKey ?? 'text'}\u0000${text}`
}
