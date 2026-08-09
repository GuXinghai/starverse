import { describe, expect, it } from 'vitest'
import {
  isEmptyGenerationV2SemanticLayer,
  projectGenerationV2SemanticLayerToSessionConfig,
} from './generationV2SessionConfigProjection'

describe('Generation V2 session config projection', () => {
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

  it('recognizes only the canonical empty config and preserves max effort', () => {
    expect(isEmptyGenerationV2SemanticLayer({ schemaVersion: 2 })).toBe(true)
    expect(isEmptyGenerationV2SemanticLayer({ schemaVersion: 2, reasoning: { mode: 'disabled' } })).toBe(false)
    expect(projectGenerationV2SemanticLayerToSessionConfig({
      schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'max' },
    }, 'openai_responses').requestedReasoningEffort).toBe('max')
  })
})
