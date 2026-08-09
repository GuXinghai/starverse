import { describe, expect, it } from 'vitest'
import { projectOpenAIResponsesIntentV1 } from './responsesIntentProjectionV1'

describe('OpenAI Responses intent projection V1 provider-extension boundary', () => {
  it('encodes GPT-5.6 reasoning mode and persisted context instead of accepting them without wire', () => {
    const result = projectOpenAIResponsesIntentV1({
      schemaVersion: 2,
      generation: {}, reasoning: { mode: 'enabled', effort: 'max', summary: 'auto' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'openai_responses', reasoningMode: 'pro', reasoningContext: 'all_turns' },
    })
    expect(result.issues).toEqual([])
    expect(result.request.reasoning).toEqual({ effort: 'max', summary: 'auto', mode: 'pro', context: 'all_turns' })
    expect(result.dispositions.filter((entry) => entry.semanticPath.startsWith('reasoning.')))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ semanticPath: 'reasoning.mode', outcome: 'encoded', wireKey: 'reasoning.mode' }),
        expect.objectContaining({ semanticPath: 'reasoning.effort', outcome: 'encoded' }),
      ]))
  })

  it('rejects provider reasoning mode/context when shared reasoning is disabled', () => {
    const result = projectOpenAIResponsesIntentV1({
      schemaVersion: 2,
      generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'openai_responses', reasoningMode: 'pro', reasoningContext: 'current_turn' },
    })
    expect(result.issues.map((issue) => issue.semanticPath)).toEqual([
      'providerExtension.reasoningContext', 'providerExtension.reasoningMode',
    ])
  })

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

  it('rejects included inline and URL attachments instead of marking them encoded', () => {
    const result = projectOpenAIResponsesIntentV1({
      schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      attachments: [{ kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'inline_text', conversion: 'plain_text' }],
    })
    expect(result.issues.map((issue) => issue.semanticPath)).toEqual([
      'attachments[].conversion', 'attachments[].include', 'attachments[].sendAs',
    ])
    expect(result.dispositions.filter((entry) => /attachments\[\]\.(include|sendAs|conversion)$/u.test(entry.semanticPath))
      .some((entry) => entry.outcome === 'encoded')).toBe(false)
  })
})
