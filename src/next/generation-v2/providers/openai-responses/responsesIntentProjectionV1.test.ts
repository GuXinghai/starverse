import { describe, expect, it } from 'vitest'
import { projectOpenAIResponsesIntentV1 } from './responsesIntentProjectionV1'

describe('OpenAI Responses intent projection V1 provider-extension boundary', () => {
  it('rejects Anthropic display semantics instead of silently accepting another provider configuration', () => {
    const result = projectOpenAIResponsesIntentV1({
      schemaVersion: 2,
      generation: {}, reasoning: { mode: 'enabled' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 },
    })
    expect(result.issues).toEqual([
      { semanticPath: 'providerExtension.kind', code: 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD' },
      { semanticPath: 'providerExtension.manualThinkingBudgetTokens', code: 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD' },
      { semanticPath: 'providerExtension.thinkingDisplay', code: 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD' },
      { semanticPath: 'providerExtension.thinkingMode', code: 'OPENAI_UNSUPPORTED_EXPLICIT_FIELD' },
    ])
    expect(result.request.generation).not.toHaveProperty('verbosity')
  })
})
