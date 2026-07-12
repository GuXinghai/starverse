import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { AnthropicProviderNativeSnapshot } from '@/next/provider/anthropic/anthropicProviderNativeContent'
import type { ReasoningDisplayBlock } from '@/next/state/types'

export type AnthropicReasoningDisplayAssemblerState = {
  thinkingBlockIndexes: Set<number>
  textByBlockKey: Map<string, string>
}

export type AnthropicThinkingFinalization = Readonly<{
  block: ReasoningDisplayBlock | null
  diagnostic: unknown | null
}>

export function createAnthropicReasoningDisplayAssemblerState(): AnthropicReasoningDisplayAssemblerState {
  return {
    thinkingBlockIndexes: new Set(),
    textByBlockKey: new Map(),
  }
}

export function ingestAnthropicThinkingBlockStart(input: Readonly<{
  event: unknown
  state?: AnthropicReasoningDisplayAssemblerState
}>): void {
  const record = asRecord(input.event)
  if (!record || record.type !== 'content_block_start') return
  const index = readBlockIndex(record)
  if (index === null) return
  const contentBlock = asRecord(record.content_block)
  if (contentBlock?.type !== 'thinking') return
  input.state?.thinkingBlockIndexes.add(index)
}

export function appendAnthropicThinkingDelta(input: Readonly<{
  event: unknown
  messageId: string
  state?: AnthropicReasoningDisplayAssemblerState
}>): ReasoningDisplayBlock | null {
  const record = asRecord(input.event)
  if (!record || record.type !== 'content_block_delta') return null
  const blockIndex = readBlockIndex(record)
  if (blockIndex === null || !input.state?.thinkingBlockIndexes.has(blockIndex)) return null
  const delta = asRecord(record.delta)
  const thinking = delta?.type === 'thinking_delta' && typeof delta.thinking === 'string' ? delta.thinking : ''
  if (thinking.length === 0) return null

  const blockKey = buildAnthropicThinkingBlockKey(blockIndex)
  const previous = input.state.textByBlockKey.get(blockKey) ?? ''
  const nextText = `${previous}${thinking}`
  input.state.textByBlockKey.set(blockKey, nextText)

  return createAnthropicThinkingDisplayBlock({
    messageId: input.messageId,
    blockIndex,
    text: nextText,
    sourceEventType: 'content_block_delta.thinking_delta',
  })
}

export function buildAnthropicFinalThinkingDisplayBlock(input: Readonly<{
  messageId: string
  blockIndex: number
  text: string
  state?: AnthropicReasoningDisplayAssemblerState
}>): AnthropicThinkingFinalization {
  const blockKey = buildAnthropicThinkingBlockKey(input.blockIndex)
  const previous = input.state?.textByBlockKey.get(blockKey)

  if (input.text.length === 0) {
    return {
      block: null,
      diagnostic: previous && previous.length > 0
        ? createAnthropicThinkingFinalDiagnostic({
            type: 'anthropic_thinking_final_empty',
            blockIndex: input.blockIndex,
            streamText: previous,
            finalText: '',
          })
        : null,
    }
  }

  if (previous === input.text) {
    return { block: null, diagnostic: null }
  }

  input.state?.textByBlockKey.set(blockKey, input.text)
  return {
    block: createAnthropicThinkingDisplayBlock({
      messageId: input.messageId,
      blockIndex: input.blockIndex,
      text: input.text,
      sourceEventType: 'anthropic_messages.content.thinking',
    }),
    diagnostic: previous !== undefined
      ? createAnthropicThinkingFinalDiagnostic({
          type: 'anthropic_thinking_final_mismatch',
          blockIndex: input.blockIndex,
          streamText: previous,
          finalText: input.text,
        })
      : null,
  }
}

export function collectAnthropicThinkingTextByBlockIndex(
  snapshot: AnthropicProviderNativeSnapshot,
): Map<number, string> {
  const out = new Map<number, string>()
  snapshot.content.forEach((block, index) => {
    const record = asRecord(block)
    if (!record || record.type !== 'thinking') return
    if (typeof record.thinking !== 'string' || record.thinking.length === 0) return
    out.set(index, record.thinking)
  })
  return out
}

export function buildAnthropicThinkingDeltaEvents(input: Readonly<{
  event: unknown
  messageId: string
  state?: AnthropicReasoningDisplayAssemblerState
}>): StarverseStreamEvent[] {
  ingestAnthropicThinkingBlockStart({
    event: input.event,
    state: input.state,
  })
  const block = appendAnthropicThinkingDelta(input)
  if (!block) return []
  return [{
    type: 'message.reasoning_display_block_upsert',
    messageId: input.messageId,
    choiceIndex: 0,
    block,
  }]
}

export function buildAnthropicFinalThinkingDisplayEvents(input: Readonly<{
  snapshot: AnthropicProviderNativeSnapshot
  messageId: string
  state?: AnthropicReasoningDisplayAssemblerState
}>): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []
  const finalTexts = collectAnthropicThinkingTextByBlockIndex(input.snapshot)
  const blockIndexes = new Set<number>(finalTexts.keys())
  for (const key of input.state?.textByBlockKey.keys() ?? []) {
    const parsed = parseAnthropicThinkingBlockKey(key)
    if (parsed !== null) blockIndexes.add(parsed)
  }

  for (const blockIndex of [...blockIndexes].sort((a, b) => a - b)) {
    const result = buildAnthropicFinalThinkingDisplayBlock({
      messageId: input.messageId,
      blockIndex,
      text: finalTexts.get(blockIndex) ?? '',
      state: input.state,
    })
    if (result.diagnostic) {
      events.push({
        type: 'message.reasoning_raw_detail',
        messageId: input.messageId,
        choiceIndex: 0,
        detail: result.diagnostic,
      })
    }
    if (result.block) {
      events.push({
        type: 'message.reasoning_display_block_upsert',
        messageId: input.messageId,
        choiceIndex: 0,
        block: result.block,
      })
    }
  }
  return events
}

function createAnthropicThinkingDisplayBlock(input: Readonly<{
  messageId: string
  blockIndex: number
  text: string
  sourceEventType: string
}>): ReasoningDisplayBlock {
  return {
    blockId: `${input.messageId}:reasoning-display:anthropic:anthropic_messages:${input.blockIndex}:thinking`,
    ordinal: input.blockIndex,
    type: 'text',
    text: input.text,
    semanticRole: 'thinking',
    providerKey: 'anthropic',
    sourceEventType: input.sourceEventType,
  }
}

function buildAnthropicThinkingBlockKey(blockIndex: number): string {
  return `block:${blockIndex}:thinking`
}

function parseAnthropicThinkingBlockKey(key: string): number | null {
  const match = /^block:(\d+):thinking$/.exec(key)
  if (!match) return null
  const index = Number(match[1])
  return Number.isInteger(index) && index >= 0 ? index : null
}

function readBlockIndex(record: Record<string, unknown>): number | null {
  return typeof record.index === 'number' && Number.isInteger(record.index) && record.index >= 0
    ? record.index
    : null
}

function createAnthropicThinkingFinalDiagnostic(input: Readonly<{
  type: 'anthropic_thinking_final_empty' | 'anthropic_thinking_final_mismatch'
  blockIndex: number
  streamText: string
  finalText: string
}>): Readonly<Record<string, unknown>> {
  return {
    type: input.type,
    provider: 'anthropic',
    blockIndex: input.blockIndex,
    streamLength: input.streamText.length,
    finalLength: input.finalText.length,
    streamHash: stableTextHash(input.streamText),
    finalHash: stableTextHash(input.finalText),
  }
}

function stableTextHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
