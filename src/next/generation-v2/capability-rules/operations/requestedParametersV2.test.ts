import { describe, expect, it } from 'vitest'
import { decodeGenerationIntentLayerV2 } from '../../../../core/generation-v2/domain/generationIntentV2'
import {
  authorRequestedParametersPolicyV2,
  decodeRequestedParametersPolicyV2,
  executeRequestedParametersRuleV2,
} from '../../../../core/generation-v2/capability-rules/operations/requestedParametersV2'

describe('requested parameter Rule operation', () => {
  it('round-trips a closed policy with an explicit decision for every accepted key', () => {
    for (const extensionKind of ['none', 'openrouter_chat', 'openai_responses', 'anthropic_messages', 'gemini_generate_content', 'gemini_interactions'] as const) {
      const policy = authorRequestedParametersPolicyV2(extensionKind)
      expect(decodeRequestedParametersPolicyV2(policy)).toEqual(policy)
      expect(Object.keys(policy.parameters)).toHaveLength(22)
      expect(policy.parameters['web.searchPrompt']).toEqual({ kind: 'defer', reason: 'target_has_no_reviewed_search_prompt_mapping' })
    }
    expect(() => decodeRequestedParametersPolicyV2({
      ...authorRequestedParametersPolicyV2('openai_responses'),
      parameters: { ...authorRequestedParametersPolicyV2('openai_responses').parameters, unknown: { kind: 'defer', reason: 'unknown' } },
    })).toThrow('GENERATION_V2_REQUESTED_PARAMETERS_POLICY_INVALID')
  })

  it('maps OpenRouter verbosity and cross-provider sampling and reasoning values, then removes the effective envelope', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      generation: { temperature: 0.4 },
      reasoning: { mode: 'enabled' },
      web: { mode: 'disabled' },
      providerExtension: { kind: 'openrouter_chat' },
      requestedParameters: {
        verbosity: { mode: 'custom', value: 'high', source: 'global' },
        temperature: { mode: 'custom', value: 0.4, source: 'project' },
        topK: { mode: 'custom', value: 20, source: 'conversation' },
        seed: { mode: 'custom', value: 42 },
        stopSequences: { mode: 'custom', value: ['END'] },
        reasoningEffort: { mode: 'custom', value: 'high' },
        reasoningSummary: { mode: 'custom', value: 'detailed' },
        thinkingEnabled: { mode: 'custom', value: true },
        googleSearch: { mode: 'custom', value: true },
        imageSearch: { mode: 'custom', value: true },
        thinkingBudget: { mode: 'custom', value: 0 },
      },
    })
    const policy = authorRequestedParametersPolicyV2('openrouter_chat')
    const result = executeRequestedParametersRuleV2(requested, requested, policy)
    expect(requested.requestedParameters?.verbosity).toEqual({ mode: 'custom', value: 'high', source: 'global' })
    expect(result.effective.requestedParameters).toBeUndefined()
    expect(result.effective.generation).toEqual({ temperature: 0.4, topK: 20, seed: 42, stop: ['END'] })
    expect(result.effective.reasoning).toEqual({ mode: 'enabled', effort: 'high', summary: 'detailed' })
    expect(result.effective.providerExtension).toEqual({ kind: 'openrouter_chat', verbosity: 'high' })
    expect(result.effective.web).toEqual({ mode: 'provider_search', types: ['web', 'image'] })
    expect(result.decisions.find(item => item.path === 'requestedParameters.thinkingBudget')).toMatchObject({
      outcome: 'deferred', reason: 'target_has_no_reviewed_thinking_budget_mapping',
    })
    expect(result.decisions).toHaveLength(11)
  })

  it('maps Anthropic inherited budgets only when valid and explicitly defers unsupported cross-provider fields', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' },
      requestedParameters: {
        thinkingBudget: { mode: 'custom', value: 1024, source: 'global' },
        thinkingLevel: { mode: 'custom', value: 'high', source: 'project' },
        repetitionPenalty: { mode: 'custom', value: 1.2, source: 'project' },
        topP: { mode: 'custom', value: 0.7 },
      },
    })
    const result = executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('anthropic_messages'))
    expect(result.effective.providerExtension).toEqual({ kind: 'anthropic_messages', thinkingDisplay: 'summarized',
      thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 })
    expect(result.effective.generation).toEqual({ repetitionPenalty: 1.2, topP: 0.7 })
    expect(result.decisions.find(item => item.path === 'requestedParameters.thinkingLevel')).toMatchObject({
      outcome: 'deferred', reason: 'target_has_no_reviewed_thinking_level_mapping',
    })
    expect(requested.requestedParameters?.thinkingBudget).toEqual({ mode: 'custom', value: 1024, source: 'global' })
  })

  it('rejects an unusable Anthropic manual budget without selecting a fallback budget', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' },
      requestedParameters: { thinkingBudget: { mode: 'custom', value: 0, source: 'global' } },
    })
    expect(() => executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('anthropic_messages')))
      .toThrow('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED')
    expect(requested.requestedParameters?.thinkingBudget).toEqual({ mode: 'custom', value: 0, source: 'global' })
  })

  it('rejects conflicting Gemini budget and level or thought inclusion requests', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' },
      requestedParameters: {
        thinkingBudget: { mode: 'custom', value: 1000 },
        thinkingLevel: { mode: 'custom', value: 'high' },
      },
    })
    expect(() => executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('gemini_generate_content')))
      .toThrow('GENERATION_V2_RULE_PARAMETER_CONFLICT')
    const thoughts = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' },
      requestedParameters: {
        includeThoughts: { mode: 'custom', value: false },
        thoughtSummaryMode: { mode: 'custom', value: 'auto' },
      },
    })
    expect(() => executeRequestedParametersRuleV2(thoughts, thoughts, authorRequestedParametersPolicyV2('gemini_generate_content')))
      .toThrow('GENERATION_V2_RULE_PARAMETER_CONFLICT')
  })

  it('removes explicit omit targets from effective semantics while retaining the raw record', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      generation: { topP: 0.9 },
      providerExtension: { kind: 'openai_responses', verbosity: 'low' },
      requestedParameters: {
        topP: { mode: 'omit', source: 'conversation' },
        verbosity: { mode: 'omit', source: 'conversation' },
      },
    })
    const result = executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('openai_responses'))
    expect(requested.requestedParameters?.topP).toEqual({ mode: 'omit', source: 'conversation' })
    expect(result.effective.generation).toEqual({})
    expect(result.effective.providerExtension).toEqual({ kind: 'openai_responses' })
    expect(result.decisions.every(item => item.outcome === 'preserved')).toBe(true)
  })

  it('projects branded tools, image ratios, and attachments while removing the requested envelope', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      image: { mode: 'generate', aspectRatio: '16:9', resolution: '2K' },
      tools: { mode: 'enabled', allowedToolIds: ['search', 'calculator'], toolChoice: { mode: 'omitted' },
        sideEffectConfirmation: 'required_each_retry' },
      attachments: [{ kind: 'managed_file', assetId: 'asset-1', assetRevisionId: 'revision-1',
        assetSha256: 'a'.repeat(64), include: true, sendAs: 'image_reference', conversion: 'none' }],
      providerExtension: { kind: 'openrouter_chat' },
      requestedParameters: { verbosity: { mode: 'custom', value: 'high', source: 'global' } },
    })
    const result = executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('openrouter_chat'))
    expect(result.effective.image).toEqual({ mode: 'generate', aspectRatio: expect.objectContaining({ value: '16:9' }), resolution: '2K' })
    expect(result.effective.tools?.mode).toBe('enabled')
    expect(result.effective.tools?.mode === 'enabled' && result.effective.tools.allowedToolIds.map(item => item.value))
      .toEqual(['calculator', 'search'])
    expect(result.effective.attachments?.[0].kind).toBe('managed_file')
    expect(result.effective.attachments?.[0].kind === 'managed_file' && result.effective.attachments[0].assetId.value)
      .toBe('asset-1')
    expect(result.effective.requestedParameters).toBeUndefined()
  })

  it('keeps complete resolved reasoning after thinkingEnabled omit and clears inherited reasoning candidates', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      reasoning: { mode: 'enabled', effort: 'high', summary: 'concise' },
      providerExtension: { kind: 'openrouter_chat', verbosity: 'low' },
      requestedParameters: {
        thinkingEnabled: { mode: 'omit', source: 'conversation' },
        reasoningEffort: { mode: 'custom', value: 'low', source: 'global' },
        reasoningSummary: { mode: 'custom', value: 'detailed', source: 'project' },
      },
    })
    const result = executeRequestedParametersRuleV2(requested, requested, authorRequestedParametersPolicyV2('openrouter_chat'))
    expect(result.effective.reasoning).toEqual({ mode: 'disabled' })
    expect(result.decisions).toContainEqual(expect.objectContaining({ path: 'requestedParameters.thinkingEnabled',
      outcome: 'preserved', reason: 'explicit_parameter_omission_removed_effective_target' }))
    expect(result.decisions).toContainEqual(expect.objectContaining({ path: 'requestedParameters.reasoningEffort',
      outcome: 'deferred', reason: 'reasoning_mode_explicitly_omitted' }))
    expect(result.decisions).toContainEqual(expect.objectContaining({ path: 'requestedParameters.reasoningSummary',
      outcome: 'deferred', reason: 'reasoning_mode_explicitly_omitted' }))
  })

  it('removes a pre-existing effective candidate whenever the explicit Rule decision is defer', () => {
    const requested = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      generation: { temperature: 0.8 },
      requestedParameters: { temperature: { mode: 'custom', value: 0.8, source: 'global' } },
    })
    const reviewed = authorRequestedParametersPolicyV2('openrouter_chat')
    const parameters = { ...reviewed.parameters, temperature: { kind: 'defer' as const, reason: 'target_rejects_temperature' } }
    const policy = decodeRequestedParametersPolicyV2({ ...reviewed, parameters })
    const result = executeRequestedParametersRuleV2(requested, requested, policy)
    expect(result.effective.generation).toEqual({})
    expect(result.decisions).toContainEqual(expect.objectContaining({ path: 'requestedParameters.temperature', outcome: 'deferred',
      reason: 'target_rejects_temperature' }))
  })
})
