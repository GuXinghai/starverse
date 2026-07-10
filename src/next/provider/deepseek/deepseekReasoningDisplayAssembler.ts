import type { ReasoningDisplayBlock } from '@/next/state/types'

export type DeepSeekReasoningDisplayAssemblerState = {
  textByBlockKey: Map<string, string>
  streamedBlockKeys: Set<string>
}

export function createDeepSeekReasoningDisplayAssemblerState(): DeepSeekReasoningDisplayAssemblerState {
  return {
    textByBlockKey: new Map(),
    streamedBlockKeys: new Set(),
  }
}

export function appendDeepSeekReasoningDelta(input: Readonly<{
  messageId: string
  choiceIndex: number
  text: string
  state?: DeepSeekReasoningDisplayAssemblerState
}>): ReasoningDisplayBlock | null {
  if (input.text.length === 0) return null

  const blockKey = buildDeepSeekReasoningBlockKey(input.choiceIndex)
  const previous = input.state?.textByBlockKey.get(blockKey) ?? ''
  const nextText = `${previous}${input.text}`
  input.state?.textByBlockKey.set(blockKey, nextText)
  input.state?.streamedBlockKeys.add(blockKey)

  return createDeepSeekReasoningDisplayBlock({
    messageId: input.messageId,
    choiceIndex: input.choiceIndex,
    text: nextText,
  })
}

export function buildDeepSeekFinalReasoningDisplayBlock(input: Readonly<{
  messageId: string
  choiceIndex: number
  text: string
  state?: DeepSeekReasoningDisplayAssemblerState
}>): ReasoningDisplayBlock | null {
  if (input.text.length === 0) return null

  const blockKey = buildDeepSeekReasoningBlockKey(input.choiceIndex)
  const previous = input.state?.textByBlockKey.get(blockKey)
  if (previous !== undefined) {
    if (previous === input.text) return null
    if (input.text.length <= previous.length) return null
  }

  input.state?.textByBlockKey.set(blockKey, input.text)

  return createDeepSeekReasoningDisplayBlock({
    messageId: input.messageId,
    choiceIndex: input.choiceIndex,
    text: input.text,
  })
}

function createDeepSeekReasoningDisplayBlock(input: Readonly<{
  messageId: string
  choiceIndex: number
  text: string
}>): ReasoningDisplayBlock {
  return {
    blockId: `${input.messageId}:deepseek:${input.choiceIndex}:reasoning_content`,
    ordinal: input.choiceIndex,
    type: 'text',
    text: input.text,
    semanticRole: 'reasoning',
    providerKey: 'deepseek',
    sourceEventType: 'reasoning_content',
  }
}

function buildDeepSeekReasoningBlockKey(choiceIndex: number): string {
  return `choice:${choiceIndex}:reasoning_content`
}
