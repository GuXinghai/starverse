import { describe, expect, it } from 'vitest'
import {
  isEmptyGenerationV2SemanticLayer,
  projectGenerationV2SemanticLayerToSessionConfig,
} from './generationV2SessionConfigProjection'

describe('Generation V2 session config projection', () => {
  it('keeps omitted image resolution omitted when hydrating a provider-default request', () => {
    const projected = projectGenerationV2SemanticLayerToSessionConfig({ schemaVersion: 2,
      generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      image: { mode: 'generate', aspectRatio: '1:1' }, tools: { mode: 'disabled' },
      providerExtension: { kind: 'gemini_interactions' },
    }, 'google_ai_studio')
    expect(projected.patch.imageGeneration).toMatchObject({ resolution: '', detail: { imageSize: '' } })
  })

  it('projects the persisted semantic fields used by the retained controls without losing exact reasoning state', () => {
    const projected = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2,
      generation: { temperature: 0.25, topP: 0.8, stop: ['END'] },
      reasoning: { mode: 'enabled', effort: 'xhigh', summary: 'detailed', exclude: true },
      web: { mode: 'provider_search', types: ['web', 'image'], engine: 'native', maxResults: 4,
        searchContextSize: 'high' },
      image: { mode: 'generate', outputMode: 'image_and_text', aspectRatio: '16:9', resolution: '2K' },
      tools: { mode: 'disabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'model_recommended' },
    }, 'anthropic_messages')

    expect(projected.requestedReasoningEffort).toBe('xhigh')
    expect(projected.requestedReasoningExclude).toBe(true)
    expect(projected.anthropicThinkingDisplay).toBe('omitted')
    expect(projected.patch.generationParams?.detail).toMatchObject({
      temperature: { mode: 'custom', value: 0.25 },
      topP: { mode: 'custom', value: 0.8 },
      stopSequences: { mode: 'custom', value: ['END'] },
      reasoningEffort: { mode: 'custom', value: 'xhigh' },
      reasoningSummary: { mode: 'custom', value: 'detailed' },
      googleSearch: { mode: 'custom', value: true },
      imageSearch: { mode: 'custom', value: true },
    })
    expect(projected.patch.webSearch).toMatchObject({ enabled: true,
      detail: { searchMode: 'enable', searchDepth: 'custom', maxResults: 4, searchEngine: 'native' } })
    expect(projected.patch.imageGeneration).toMatchObject({ enabled: true, resolution: '2K', aspectRatio: '16:9',
      detail: { outputMode: 'image_and_text' } })
  })

  it('turns persisted disabled states into explicit UI overrides instead of inheriting old defaults', () => {
    const projected = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2,
      reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' },
      tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
    }, 'openrouter')
    expect(projected.requestedReasoningEffort).toBe('none')
    expect(projected.patch.webSearch).toMatchObject({ enabled: false, detail: { searchMode: 'disable' } })
    expect(projected.patch.imageGeneration).toMatchObject({ enabled: false, mode: 'custom' })
    expect(projected.patch.generationParams?.detail).toMatchObject({
      temperature: { mode: 'omit' }, thinkingEnabled: { mode: 'custom', value: false },
    })
  })

  it('hydrates only raw-present parameters and preserves the original value and scope', () => {
    const projected = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2,
      // Effective fields can be adapted or removed; they are not a substitute
      // for entries that were absent from the raw request envelope.
      generation: { temperature: 0.8, topP: 0.9 },
      reasoning: { mode: 'disabled' },
      web: { mode: 'disabled', searchPrompt: 'Focus on primary sources' },
      requestedParameters: {
        temperature: { mode: 'custom', value: 0.4, source: 'conversation' },
        topP: { mode: 'omit', source: 'conversation' },
        verbosity: { mode: 'custom', value: 'high', source: 'global' },
        thinkingBudget: { mode: 'custom', value: 0, source: 'project' },
        thinkingEnabled: { mode: 'custom', value: false, source: 'conversation' },
        imageSearch: { mode: 'custom', value: true, source: 'conversation' },
      },
    }, 'openai_responses')

    expect(projected.requestedReasoningEffort).toBe('none')
    expect(projected.patch.generationParams?.detail).toMatchObject({
      temperature: { mode: 'custom', value: 0.4 },
      topP: { mode: 'omit' },
      verbosity: { mode: 'inherit' },
      thinkingBudget: { mode: 'inherit' },
      thinkingEnabled: { mode: 'custom', value: false },
      imageSearch: { mode: 'custom', value: true },
    })
    expect(projected.patch.generationParams?.detail).not.toHaveProperty('topK')

    const afterReasoningEffortChange = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2,
      reasoning: { mode: 'enabled', effort: 'high' },
      requestedParameters: {
        temperature: { mode: 'custom', value: 0.4, source: 'conversation' },
        reasoningEffort: { mode: 'custom', value: 'high', source: 'conversation' },
      },
    }, 'openai_responses')
    expect(afterReasoningEffortChange.patch.generationParams?.detail).toMatchObject({
      temperature: { mode: 'custom', value: 0.4 },
      reasoningEffort: { mode: 'custom', value: 'high' },
    })
    expect(afterReasoningEffortChange.requestedReasoningEffort).toBe('high')
  })

  it.each(['none', 'low'] as const)('projects raw reasoning effort %s to the quick control', effort => {
    const projected = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2,
      reasoning: { mode: 'disabled' },
      requestedParameters: { reasoningEffort: { mode: 'custom', value: effort, source: 'global' } },
    }, 'openrouter')
    expect(projected.requestedReasoningEffort).toBe(effort)
  })

  it('rehydrates a retained web search prompt in both active and dormant search intent', () => {
    const active = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2, web: { mode: 'provider_search', types: ['web'], searchPrompt: 'Use recent primary sources' },
    }, 'openrouter')
    const dormant = projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2, web: { mode: 'disabled', searchPrompt: 'Keep this search instruction' },
    }, 'openrouter')

    expect(active.patch.webSearch?.detail).toMatchObject({
      searchMode: 'enable', searchPrompt: { mode: 'customText', text: 'Use recent primary sources' },
    })
    expect(dormant.patch.webSearch?.detail).toMatchObject({
      searchMode: 'disable', searchPrompt: { mode: 'customText', text: 'Keep this search instruction' },
    })
  })

  it('recognizes only the canonical empty config and preserves max effort', () => {
    expect(isEmptyGenerationV2SemanticLayer({ schemaVersion: 2 })).toBe(true)
    expect(isEmptyGenerationV2SemanticLayer({ schemaVersion: 2, reasoning: { mode: 'disabled' } })).toBe(false)
    expect(projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'max' },
    }, 'openai_responses').requestedReasoningEffort).toBe('max')
  })
})
