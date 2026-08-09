import { describe, expect, it } from 'vitest'
import { projectReasoningPresentationV2 } from './reasoningPresentationProjectorV2'

function project(
  contractId: string,
  providerId: string,
  orderedFacts: readonly Readonly<Record<string, unknown>>[],
) {
  return projectReasoningPresentationV2({
    providerId,
    contractId,
    modelId: 'exact-model-id-is-diagnostic-only',
    answerRootId: 'answer:1',
    orderedFacts,
  })
}

describe('Generation V2 reasoning presentation projector', () => {
  it('projects Gemini GenerateContent thought summaries and hides continuation-only signatures', () => {
    const result = project('gemini-generate-content-v1beta', 'google_ai_studio', [
      { type: 'thought', text: 'first ' },
      { type: 'thought', text: 'second', thoughtSignature: 'opaque-secret' },
      { type: 'thought', text: '', thoughtSignature: 'signature-only-secret' },
    ])

    expect(result).toMatchObject({
      visibility: 'shown',
      recognizedFactCount: 3,
      unrecognizedFactCount: 0,
      displayBlocks: [{
        blockId: 'gemini-generate-content-v1beta:answer:1:reasoning:0',
        type: 'text',
        text: 'first second',
        semanticRole: 'summary',
      }],
    })
    expect(JSON.stringify(result)).not.toContain('opaque-secret')
    expect(JSON.stringify(result)).not.toContain('signature-only-secret')
  })

  it('keeps Gemini Interactions summary order while excluding search and citation facts', () => {
    const result = project('gemini-interactions-v1beta', 'google_ai_studio', [
      { type: 'thought_summary', summary: 'before' },
      { type: 'google_search_call', id: 'search-1' },
      { type: 'url_citation', url_citation: { url: 'https://example.com' } },
      { type: 'thought_image', image: { url: 'data:image/png;base64,YQ==', mimeType: 'image/png' } },
      { type: 'thought_summary', summary: 'after' },
      { type: 'thought_signature', thought_signature: 'hidden' },
    ])

    expect(result.displayBlocks).toEqual([
      expect.objectContaining({ ordinal: 0, type: 'text', text: 'before', semanticRole: 'summary' }),
      expect.objectContaining({ ordinal: 1, type: 'image', url: 'data:image/png;base64,YQ==', semanticRole: 'summary' }),
      expect.objectContaining({ ordinal: 2, type: 'text', text: 'after', semanticRole: 'summary' }),
    ])
    expect(result).toMatchObject({ recognizedFactCount: 6, unrecognizedFactCount: 0 })
  })

  it.each([
    {
      contractId: 'openai-responses-v1', providerId: 'openai_responses',
      fact: { type: 'summary_text', text: 'summary' }, role: 'summary', text: 'summary',
    },
    {
      contractId: 'anthropic-messages-2023-06-01', providerId: 'anthropic',
      fact: { type: 'thinking', text: 'thinking' }, role: 'thinking', text: 'thinking',
    },
    {
      contractId: 'deepseek-stable-chat-v1', providerId: 'deepseek',
      fact: { type: 'thought', text: 'reasoning' }, role: 'reasoning', text: 'reasoning',
    },
    {
      contractId: 'openrouter-chat-completions-v1', providerId: 'openrouter',
      fact: { type: 'reasoning.text', text: 'trace' }, role: 'reasoning', text: 'trace',
    },
    {
      contractId: 'openrouter-chat-completions-v1', providerId: 'openrouter',
      fact: { type: 'reasoning.summary', summary: 'short' }, role: 'summary', text: 'short',
    },
    {
      contractId: 'openrouter-chat-completions-v1', providerId: 'openrouter',
      fact: { type: 'thought_summary', summary: 'provider thought summary' }, role: 'thought', text: 'provider thought summary',
    },
    {
      contractId: 'ollama-chat-v1', providerId: 'ollama',
      fact: { type: 'thought', text: 'thinking' }, role: 'thinking', text: 'thinking',
    },
    {
      contractId: 'lmstudio-openresponses', providerId: 'lmstudio',
      fact: { type: 'thought', text: 'local trace' }, role: 'reasoning', text: 'local trace',
    },
  ])('projects $contractId facts using contract semantics', ({ contractId, providerId, fact, role, text }) => {
    expect(project(contractId, providerId, [fact]).displayBlocks).toEqual([
      expect.objectContaining({ type: 'text', semanticRole: role, text }),
    ])
  })

  it.each([
    ['openai-responses-v1', 'openai_responses', { type: 'reasoning.encrypted', encrypted_content: 'secret' }, 'encrypted'],
    ['openrouter-chat-completions-v1', 'openrouter', { type: 'reasoning.encrypted', data: 'secret' }, 'encrypted'],
    ['anthropic-messages-2023-06-01', 'anthropic', { type: 'thinking_omitted', signature: 'secret' }, 'omitted'],
    ['anthropic-messages-2023-06-01', 'anthropic', { type: 'redacted_thinking', data: 'secret' }, 'redacted'],
  ])('projects explicit opaque facts without exposing their payload', (contractId, providerId, fact, opaqueKind) => {
    const result = project(contractId, providerId, [fact])
    expect(result.displayBlocks).toEqual([
      expect.objectContaining({ type: 'opaque', opaqueKind }),
    ])
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('preserves unknown facts as diagnostics without displaying or failing', () => {
    const fact = { type: 'future_reasoning_fact', nested: { unknown: true } }
    const result = project('gemini-generate-content-v1beta', 'google_ai_studio', [fact])
    expect(result).toMatchObject({
      displayBlocks: [],
      visibility: 'not_returned',
      recognizedFactCount: 0,
      unrecognizedFactCount: 1,
    })
    expect(fact).toEqual({ type: 'future_reasoning_fact', nested: { unknown: true } })
  })

  it('fails closed on a provider/contract mismatch and does not use model names for dispatch', () => {
    const mismatched = projectReasoningPresentationV2({
      providerId: 'deepseek',
      contractId: 'gemini-generate-content-v1beta',
      modelId: 'gemini-looking-name',
      answerRootId: 'answer:1',
      orderedFacts: [{ type: 'thought', text: 'must not display' }],
    })
    expect(mismatched).toMatchObject({ displayBlocks: [], unrecognizedFactCount: 1 })

    const first = projectReasoningPresentationV2({
      providerId: 'deepseek', contractId: 'deepseek-stable-chat-v1', modelId: 'model-a',
      answerRootId: 'answer:1', orderedFacts: [{ type: 'thought', text: 'same' }],
    })
    const second = projectReasoningPresentationV2({
      providerId: 'deepseek', contractId: 'deepseek-stable-chat-v1', modelId: 'unrelated-model-b',
      answerRootId: 'answer:1', orderedFacts: [{ type: 'thought', text: 'same' }],
    })
    expect(second).toEqual(first)
  })

  it('produces the same final projection for live ordered facts and restart hydration', () => {
    const facts = [
      { type: 'reasoning.text', text: 'one ' },
      { type: 'reasoning.text', text: 'two' },
      { type: 'reasoning.summary', summary: 'summary' },
    ]
    const liveFinal = project('openrouter-chat-completions-v1', 'openrouter', facts)
    const restartFinal = project('openrouter-chat-completions-v1', 'openrouter',
      JSON.parse(JSON.stringify(facts)) as Readonly<Record<string, unknown>>[])
    expect(restartFinal).toEqual(liveFinal)
  })
})
