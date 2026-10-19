import { describe, expect, it } from 'vitest'
import { classifyPortableHistoryReasoningV2 } from '../../../core/generation-v2/compiler/portableHistoryReasoningClassifierV2'

describe('portable history reasoning classifier', () => {
  it('extracts the OpenAI Responses public summary and keeps encrypted or raw content opaque', () => {
    const result = classifyPortableHistoryReasoningV2({ type: 'reasoning', summary: [
      { type: 'summary_text', text: 'Public summary' },
    ], content: [{ type: 'reasoning_text', text: 'Private thought' }], encrypted_content: 'opaque-ciphertext', signature: 'opaque-signature' }, 'openai-responses-v1')

    expect(result.publicSummaries).toEqual([{ source: 'openai_responses_summary', index: 0, text: 'Public summary' }])
    expect(result.hasOpaqueReasoning).toBe(true)
    expect(JSON.stringify(result)).not.toContain('opaque-ciphertext')
    expect(JSON.stringify(result)).not.toContain('opaque-signature')
    expect(JSON.stringify(result)).not.toContain('Private thought')
  })

  it('extracts only OpenRouter reasoning.summary entries and defers encrypted or private details', () => {
    const result = classifyPortableHistoryReasoningV2({ reasoning_details: [
      { type: 'reasoning.summary', summary: 'Public provider summary' },
      { type: 'reasoning.text', text: 'Private thought', signature: 'opaque-signature' },
      { type: 'reasoning.encrypted', encrypted_content: 'opaque-ciphertext' },
    ] }, 'openrouter-chat-completions-v1')

    expect(result.publicSummaries).toEqual([{ source: 'openrouter_reasoning_summary', index: 0, text: 'Public provider summary' }])
    expect(result.hasOpaqueReasoning).toBe(true)
    expect(JSON.stringify(result)).not.toContain('opaque-ciphertext')
    expect(JSON.stringify(result)).not.toContain('opaque-signature')
    expect(JSON.stringify(result)).not.toContain('Private thought')
  })

  it('treats unsupported thought blocks as opaque without inventing public summaries', () => {
    expect(classifyPortableHistoryReasoningV2({ parts: [{ text: 'Private thought', thought: true, thoughtSignature: 'sig' }] }, 'gemini-generate-content-v1beta'))
      .toEqual({ publicSummaries: [], hasOpaqueReasoning: true })
    expect(classifyPortableHistoryReasoningV2({ content: 'ordinary answer' }, 'openrouter-chat-completions-v1'))
      .toEqual({ publicSummaries: [], hasOpaqueReasoning: false })
    expect(classifyPortableHistoryReasoningV2({ type: 'reasoning', summary: [{ type: 'summary_text', text: 'untrusted source shape' }] }, 'openrouter-chat-completions-v1'))
      .toEqual({ publicSummaries: [], hasOpaqueReasoning: true })
  })
})
