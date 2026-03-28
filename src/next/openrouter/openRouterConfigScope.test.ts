import { describe, expect, it } from 'vitest'
import {
  resolveOpenRouterConfigScopeForConvo,
  resolveOpenRouterConfigScopeForProject,
  resolveOpenRouterConfigScopeFromStoredLayers,
} from './openRouterConfigScope'

describe('openRouterConfigScope stored layers', () => {
  it('resolves conversation/project/global precedence from stored layers through one entry', () => {
    const scope = resolveOpenRouterConfigScopeFromStoredLayers({
      convoMeta: {
        reasoningPrefs: { mode: 'auto', effort: 'high', exclude: true },
        webSearchOverride: { searchMode: 'default', searchDepth: 'custom', maxResults: 7 },
        samplingParamsOverride: {
          top_p: { mode: 'custom', value: 0.91 },
        },
      },
      projectMeta: {
        reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: true },
        webSearchDefaults: { searchMode: 'enable', searchDepth: 'high' },
        samplingParamsDefaults: {
          temperature: { mode: 'custom', value: 0.43 },
          top_p: { mode: 'custom', value: 0.55 },
        },
      },
      globalReasoningPrefs: { mode: 'effort', effort: 'low', exclude: false },
      globalWebSearchDefaults: { searchMode: 'disable', searchDepth: 'low' },
      globalSamplingParamsDefaults: {
        max_tokens: { mode: 'custom', value: 900 },
      },
      webSearchOptions: { accountDefaultEnabled: false },
    })

    expect(scope.reasoning.convoLayer).toEqual({ mode: 'auto', effort: 'auto', exclude: false })
    expect(scope.reasoning.projectLayer).toEqual({ mode: 'effort', effort: 'medium', exclude: true })
    expect(scope.reasoning.globalLayer).toEqual({ mode: 'effort', effort: 'low', exclude: false })
    expect(scope.reasoning.resolved).toEqual({ mode: 'auto', effort: 'auto', exclude: false })
    expect(scope.reasoning.source).toBe('conversation')

    expect(scope.webSearch.convoLayer).toEqual({ searchMode: 'default', searchDepth: 'custom', maxResults: 7 })
    expect(scope.webSearch.projectLayer).toEqual({ searchMode: 'enable', searchDepth: 'high' })
    expect(scope.webSearch.globalLayer).toEqual({ searchMode: 'disable', searchDepth: 'low' })
    expect(scope.webSearch.resolved).toMatchObject({
      resolvedMode: 'enable',
      resolvedDepth: 'custom',
      effectiveMode: true,
      effectiveMaxResults: 7,
    })

    expect(scope.samplingParams.convoLayer).toEqual({
      top_p: { mode: 'custom', value: 0.91 },
    })
    expect(scope.samplingParams.projectLayer).toEqual({
      temperature: { mode: 'custom', value: 0.43 },
      top_p: { mode: 'custom', value: 0.55 },
    })
    expect(scope.samplingParams.globalLayer).toEqual({
      max_tokens: { mode: 'custom', value: 900 },
    })
    expect(scope.samplingParams.resolved.requestPatch).toEqual({
      temperature: 0.43,
      top_p: 0.91,
      max_tokens: 900,
    })
  })
})

describe('openRouterConfigScope conversation resolution', () => {
  it('resolves project meta for a conversation by projectId', () => {
    const scope = resolveOpenRouterConfigScopeForConvo({
      convo: {
        projectId: 'p1',
        meta: { reasoningPrefs: { mode: 'effort', effort: 'high', exclude: true }, webSearchOverride: { searchMode: 'default' } },
      },
      projects: [
        { id: 'p1', meta: { reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: false }, webSearchDefaults: { searchMode: 'enable', searchDepth: 'low' } } },
        { id: 'p2', meta: { webSearchDefaults: { searchMode: 'disable' } } },
      ],
      globalReasoningPrefs: { mode: 'effort', effort: 'low', exclude: false },
      globalWebSearchDefaults: { searchMode: 'disable' },
      webSearchOptions: { accountDefaultEnabled: false },
    })

    expect(scope.projectMeta).toEqual({
      reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: false },
      webSearchDefaults: { searchMode: 'enable', searchDepth: 'low' },
    })
    expect(scope.reasoning.resolved).toEqual({ mode: 'effort', effort: 'high', exclude: true })
    expect(scope.reasoning.source).toBe('conversation')
    expect(scope.webSearch.projectLayer).toEqual({ searchMode: 'enable', searchDepth: 'low' })
    expect(scope.webSearch.resolved.effectiveMode).toBe(true)
  })
})

describe('openRouterConfigScope project resolution', () => {
  it('exposes project/global layers without inventing a conversation layer', () => {
    const scope = resolveOpenRouterConfigScopeForProject({
      projectMeta: {
        reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: true },
        webSearchDefaults: { searchMode: 'enable' },
        samplingParamsDefaults: {
          top_k: { mode: 'custom', value: 7 },
        },
      },
      globalReasoningPrefs: { mode: 'effort', effort: 'low', exclude: false },
      globalWebSearchDefaults: { searchMode: 'disable' },
      globalSamplingParamsDefaults: {
        temperature: { mode: 'custom', value: 0.3 },
      },
      webSearchOptions: { accountDefaultEnabled: false },
    })

    expect(scope.reasoning.convoLayer).toBeNull()
    expect(scope.reasoning.projectLayer).toEqual({ mode: 'effort', effort: 'medium', exclude: true })
    expect(scope.reasoning.resolved).toEqual({ mode: 'effort', effort: 'medium', exclude: true })
    expect(scope.reasoning.source).toBe('project')
    expect(scope.webSearch.convoLayer).toBeNull()
    expect(scope.webSearch.projectLayer).toEqual({ searchMode: 'enable' })
    expect(scope.webSearch.resolved.effectiveMode).toBe(true)
    expect(scope.samplingParams.convoLayer).toBeNull()
    expect(scope.samplingParams.resolved.requestPatch).toEqual({
      temperature: 0.3,
      top_k: 7,
    })
  })
})
