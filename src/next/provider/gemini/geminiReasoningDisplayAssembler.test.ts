import { describe, expect, it } from 'vitest'
import {
  appendGeminiThoughtSummaryDelta,
  buildGeminiFinalThoughtSummaryDisplayBlock,
  buildGeminiFinalThoughtSummaryEvents,
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

  it('does not duplicate an identical final text', () => {
    const state = createGeminiReasoningDisplayAssemblerState()
    appendGeminiThoughtSummaryDelta({ messageId, candidateIndex: 0, text: 'I am thinking.', state })

    const result = buildGeminiFinalThoughtSummaryDisplayBlock({
      messageId,
      candidateIndex: 0,
      text: 'I am thinking.',
      state,
    })

    expect(result).toEqual({ block: null, diagnostic: null })
  })

  it('does not clear streamed text when final thought text is empty', () => {
    const state = createGeminiReasoningDisplayAssemblerState()
    appendGeminiThoughtSummaryDelta({ messageId, candidateIndex: 0, text: 'I am thinking.', state })

    const result = buildGeminiFinalThoughtSummaryDisplayBlock({
      messageId,
      candidateIndex: 0,
      text: '',
      state,
    })

    expect(result.block).toBeNull()
    expect(result.diagnostic).toMatchObject({
      type: 'gemini_thought_summary_final_empty',
      provider: 'google_ai_studio',
      candidateIndex: 0,
      streamLength: 14,
      finalLength: 0,
    })
    expect(JSON.stringify(result.diagnostic)).not.toContain('I am thinking.')

    const next = appendGeminiThoughtSummaryDelta({ messageId, candidateIndex: 0, text: ' Still here.', state })
    expect(next?.type === 'text' ? next.text : undefined).toBe('I am thinking. Still here.')
  })

  it('overwrites the same blockId when final text is different', () => {
    const state = createGeminiReasoningDisplayAssemblerState()
    appendGeminiThoughtSummaryDelta({ messageId, candidateIndex: 0, text: 'partial', state })

    const result = buildGeminiFinalThoughtSummaryDisplayBlock({
      messageId,
      candidateIndex: 0,
      text: 'complete thought',
      state,
    })

    expect(result.block).toMatchObject({
      blockId,
      text: 'complete thought',
      providerKey: 'google_ai_studio',
      sourceEventType: 'candidate.part.thought.text',
    })
    expect(result.diagnostic).toMatchObject({
      type: 'gemini_thought_summary_final_mismatch',
      candidateIndex: 0,
      streamLength: 7,
      finalLength: 16,
    })
    expect(JSON.stringify(result.diagnostic)).not.toContain('partial')
    expect(JSON.stringify(result.diagnostic)).not.toContain('complete thought')
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

  it('builds safe final diagnostics through event helpers', () => {
    const state = createGeminiReasoningDisplayAssemblerState()
    appendGeminiThoughtSummaryDelta({ messageId, candidateIndex: 0, text: 'partial', state })

    const events = buildGeminiFinalThoughtSummaryEvents({
      response: { candidates: [{ index: 0, content: { parts: [] } }] },
      messageId,
      state,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'message.reasoning_raw_detail',
      messageId,
      choiceIndex: 0,
      detail: {
        type: 'gemini_thought_summary_final_empty',
        streamLength: 7,
        finalLength: 0,
      },
    })
    expect(JSON.stringify(events[0])).not.toContain('partial')
  })
})
