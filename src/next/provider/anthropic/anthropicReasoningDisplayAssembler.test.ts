import { describe, expect, it } from 'vitest'
import {
  appendAnthropicThinkingDelta,
  buildAnthropicFinalThinkingDisplayBlock,
  buildAnthropicFinalThinkingDisplayEvents,
  buildAnthropicThinkingDeltaEvents,
  collectAnthropicThinkingTextByBlockIndex,
  createAnthropicReasoningDisplayAssemblerState,
  ingestAnthropicThinkingBlockStart,
} from '@/next/provider/anthropic/anthropicReasoningDisplayAssembler'
import type { AnthropicProviderNativeSnapshot } from '@/next/provider/anthropic/anthropicProviderNativeContent'

const messageId = 'assistant_1'
const blockId = `${messageId}:reasoning-display:anthropic:anthropic_messages:0:thinking`

function thinkingStart(index = 0) {
  return { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } }
}

function textStart(index = 0) {
  return { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }
}

function thinkingDelta(thinking: string, index = 0) {
  return { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } }
}

function signatureDelta(signature: string, index = 0) {
  return { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } }
}

function snapshot(content: AnthropicProviderNativeSnapshot['content']): AnthropicProviderNativeSnapshot {
  return {
    providerKey: 'anthropic',
    sourceApi: 'anthropic_messages',
    snapshotKey: 'assistant',
    role: 'assistant',
    status: 'final',
    content,
  }
}

describe('anthropicReasoningDisplayAssembler', () => {
  it('emits multiple upserts with one stable blockId and continuous text', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    ingestAnthropicThinkingBlockStart({ event: thinkingStart(), state })

    const blocks = ['I', ' am', ' thinking', '.'].map((text) =>
      appendAnthropicThinkingDelta({
        event: thinkingDelta(text),
        messageId,
        state,
      }))

    expect(blocks).toHaveLength(4)
    expect(blocks.every((block) => block?.blockId === blockId)).toBe(true)
    expect(blocks.map((block) => block?.type === 'text' ? block.text : undefined)).toEqual([
      'I',
      'I am',
      'I am thinking',
      'I am thinking.',
    ])
  })

  it('does not display thinking deltas for unregistered or non-thinking block indexes', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    expect(appendAnthropicThinkingDelta({ event: thinkingDelta('hidden'), messageId, state })).toBeNull()

    ingestAnthropicThinkingBlockStart({ event: textStart(1), state })
    expect(appendAnthropicThinkingDelta({ event: thinkingDelta('hidden', 1), messageId, state })).toBeNull()
  })

  it('does not display signatures or redacted thinking data', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    ingestAnthropicThinkingBlockStart({ event: thinkingStart(), state })

    expect(appendAnthropicThinkingDelta({ event: signatureDelta('sig_1'), messageId, state })).toBeNull()

    const final = snapshot([
      { type: 'redacted_thinking', data: 'opaque-redacted' },
      { type: 'thinking', thinking: 'visible', signature: 'sig_2' },
    ])
    const events = buildAnthropicFinalThinkingDisplayEvents({ snapshot: final, messageId, state })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'message.reasoning_display_block_upsert',
      block: {
        text: 'visible',
        providerKey: 'anthropic',
      },
    })
    expect(JSON.stringify(events)).not.toContain('sig_1')
    expect(JSON.stringify(events)).not.toContain('sig_2')
    expect(JSON.stringify(events)).not.toContain('opaque-redacted')
  })

  it('does not duplicate identical final text', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    ingestAnthropicThinkingBlockStart({ event: thinkingStart(), state })
    appendAnthropicThinkingDelta({ event: thinkingDelta('I am thinking.'), messageId, state })

    const result = buildAnthropicFinalThinkingDisplayBlock({
      messageId,
      blockIndex: 0,
      text: 'I am thinking.',
      state,
    })

    expect(result).toEqual({ block: null, diagnostic: null })
  })

  it('does not clear streamed text when final thinking is empty', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    ingestAnthropicThinkingBlockStart({ event: thinkingStart(), state })
    appendAnthropicThinkingDelta({ event: thinkingDelta('I am thinking.'), messageId, state })

    const result = buildAnthropicFinalThinkingDisplayBlock({
      messageId,
      blockIndex: 0,
      text: '',
      state,
    })

    expect(result.block).toBeNull()
    expect(result.diagnostic).toMatchObject({
      type: 'anthropic_thinking_final_empty',
      provider: 'anthropic',
      blockIndex: 0,
      streamLength: 14,
      finalLength: 0,
    })
    expect(JSON.stringify(result.diagnostic)).not.toContain('I am thinking.')

    const next = appendAnthropicThinkingDelta({ event: thinkingDelta(' Still here.'), messageId, state })
    expect(next?.type === 'text' ? next.text : undefined).toBe('I am thinking. Still here.')
  })

  it('overwrites the same blockId when final text is different without storing full diagnostic text', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    ingestAnthropicThinkingBlockStart({ event: thinkingStart(), state })
    appendAnthropicThinkingDelta({ event: thinkingDelta('partial'), messageId, state })

    const result = buildAnthropicFinalThinkingDisplayBlock({
      messageId,
      blockIndex: 0,
      text: 'complete thinking',
      state,
    })

    expect(result.block).toMatchObject({
      blockId,
      text: 'complete thinking',
      providerKey: 'anthropic',
      sourceEventType: 'anthropic_messages.content.thinking',
    })
    expect(result.diagnostic).toMatchObject({
      type: 'anthropic_thinking_final_mismatch',
      blockIndex: 0,
      streamLength: 7,
      finalLength: 17,
    })
    expect(JSON.stringify(result.diagnostic)).not.toContain('partial')
    expect(JSON.stringify(result.diagnostic)).not.toContain('complete thinking')
  })

  it('collects final thinking text without mutating native snapshot blocks', () => {
    const final = snapshot([
      { type: 'thinking', thinking: 'first', signature: 'sig-a' },
      { type: 'text', text: ' answer' },
      { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' } },
      { type: 'thinking', thinking: 'second', signature: 'sig-b' },
      { type: 'redacted_thinking', data: 'opaque' },
    ])
    const before = JSON.parse(JSON.stringify(final))

    expect(collectAnthropicThinkingTextByBlockIndex(final)).toEqual(new Map([
      [0, 'first'],
      [3, 'second'],
    ]))

    const events = buildAnthropicFinalThinkingDisplayEvents({
      snapshot: final,
      messageId,
      state: createAnthropicReasoningDisplayAssemblerState(),
    })

    expect(events).toHaveLength(2)
    expect(events.map((event) =>
      event.type === 'message.reasoning_display_block_upsert' && event.block.type === 'text'
        ? event.block.text
        : null
    )).toEqual(['first', 'second'])
    expect(JSON.stringify(events)).not.toContain('sig-a')
    expect(JSON.stringify(events)).not.toContain('sig-b')
    expect(JSON.stringify(events)).not.toContain('toolu_1')
    expect(final).toEqual(before)
  })

  it('builds streaming upsert events only for registered thinking blocks', () => {
    const state = createAnthropicReasoningDisplayAssemblerState()
    expect(buildAnthropicThinkingDeltaEvents({ event: thinkingDelta('ignored'), messageId, state })).toEqual([])
    expect(buildAnthropicThinkingDeltaEvents({ event: thinkingStart(), messageId, state })).toEqual([])

    const events = buildAnthropicThinkingDeltaEvents({ event: thinkingDelta('shown'), messageId, state })

    expect(events).toEqual([
      {
        type: 'message.reasoning_display_block_upsert',
        messageId,
        choiceIndex: 0,
        block: expect.objectContaining({
          blockId,
          text: 'shown',
          semanticRole: 'thinking',
          providerKey: 'anthropic',
        }),
      },
    ])
  })
})
