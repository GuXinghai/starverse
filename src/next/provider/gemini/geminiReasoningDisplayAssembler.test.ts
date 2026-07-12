import { describe, expect, it } from 'vitest'
import {
  appendGeminiThoughtSummaryDelta,
  buildGeminiThoughtSummaryDeltaEvents,
  collectGeminiThoughtSummaryTextByCandidate,
  createGeminiReasoningDisplayAssemblerState,
} from '@/next/provider/gemini/geminiReasoningDisplayAssembler'

const messageId = 'assistant_1'
const blockId = `${messageId}:reasoning-display:google_ai_studio:gemini_generate_content:0:thought_summary`

describe('geminiReasoningDisplayAssembler', () => {
  it('emits multiple upserts with one stable blockId and continuous text', () => {
    const state = createGeminiReasoningDisplayAssemblerState()
    const deltas = ['I', ' am', ' thinking', '.']

    const blocks = deltas.map((text) => appendGeminiThoughtSummaryDelta({
      messageId,
      candidateIndex: 0,
      text,
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

  it('collects final thought text by candidate without mutating native parts or displaying signatures', () => {
    const response = {
      candidates: [{
        index: 0,
        content: {
          role: 'model',
          parts: [
            { text: 'signed', thought: true, thoughtSignature: 'sig-a' },
            { text: ' answer' },
            { text: ' thought', thought: true, thought_signature: 'sig-b' },
          ],
        },
      }],
    }
    const before = JSON.parse(JSON.stringify(response))

    expect(collectGeminiThoughtSummaryTextByCandidate(response).get(0)).toBe('signed thought')
    const events = buildGeminiThoughtSummaryDeltaEvents({
      response,
      messageId,
      state: createGeminiReasoningDisplayAssemblerState(),
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'message.reasoning_display_block_upsert',
      messageId,
      choiceIndex: 0,
      block: {
        blockId,
        text: 'signed thought',
      },
    })
    expect(JSON.stringify(events)).not.toContain('sig-a')
    expect(JSON.stringify(events)).not.toContain('sig-b')
    expect(response).toEqual(before)
  })
})
