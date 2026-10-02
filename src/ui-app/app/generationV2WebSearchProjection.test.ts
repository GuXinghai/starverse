import { describe, expect, it } from 'vitest'
import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import { buildGenerationV2WebSearch, projectGenerationV2WebSearchControls } from './generationV2WebSearchProjection'

function projection(providerId: string, protocolContractId: string, fields: Record<string, unknown> = {}): GenerationControlsProjectionV2 {
  const supported = (domain: unknown) => ({ state: 'supported', domain, visibility: 'visible', constraints: [], evidenceIds: [] })
  return { schemaVersion: 2, binding: { providerId, protocolContractId, endpointProfileId: 'test', modelId: 'model:test', operation: 'text' },
    capabilityRevision: 'capability:test', controls: { 'web.mode': supported({ kind: 'enum', values: ['disabled', 'provider_search'] }),
      'web.types': supported({ kind: 'enum_list', values: ['web'], maxItems: 1 }),
      ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, supported(value)])) } } as unknown as GenerationControlsProjectionV2
}

const fixtures = {
  anthropic: projection('anthropic', 'anthropic-messages-2023-06-01', { 'web.maxResults': { kind: 'range', min: 1, max: 20, integer: true } }),
  gemini: projection('google_ai_studio', 'gemini-generate-content-v1beta'),
  responses: projection('openai_responses', 'openai-responses-v1', { 'web.searchContextSize': { kind: 'enum', values: ['low', 'medium', 'high'] } }),
  openrouter: projection('openrouter', 'openrouter-chat-completions-v1', { 'web.engine': { kind: 'enum', values: ['auto', 'native', 'exa'] },
    'web.maxResults': { kind: 'range', min: 1, max: 25, integer: true }, 'web.searchContextSize': { kind: 'enum', values: ['low', 'medium', 'high'] } }),
}
const build = (projectionValue: GenerationControlsProjectionV2 | null, convo: any = { searchMode: 'enable' }, global: any = {}) => buildGenerationV2WebSearch({
  projection: projectionValue, expectedBinding: { providerId: String(projectionValue?.binding.providerId), modelId: 'model:test', operation: 'text' },
  layers: { convo, global },
})

describe('capability-bound web search', () => {
  it.each([
    ['anthropic', { mode: 'provider_search', types: ['web'], maxResults: 5 }],
    ['gemini', { mode: 'provider_search', types: ['web'] }],
    ['responses', { mode: 'provider_search', types: ['web'], searchContextSize: 'medium' }],
    ['openrouter', { mode: 'provider_search', types: ['web'], maxResults: 5, searchContextSize: 'medium', engine: 'exa' }],
  ] as const)('omits unavailable inherited optional fields for %s', (name, expected) => {
    expect(build(fixtures[name], { searchMode: 'enable' }, { searchEngine: 'exa' })).toEqual(expected)
  })
  it('accepts Anthropic 20 exactly and rejects explicit unsupported engines before resolution', () => {
    expect(build(fixtures.anthropic, { searchMode: 'enable', searchDepth: 'custom', maxResults: 20 })).toEqual({ mode: 'provider_search', types: ['web'], maxResults: 20 })
    expect(projectGenerationV2WebSearchControls(fixtures.anthropic).maxResultsBounds).toEqual({ min: 1, max: 20 })
    for (const searchEngine of ['auto', 'native', 'exa']) expect(() => build(fixtures.anthropic, { searchMode: 'enable', searchEngine })).toThrow('errors.webSearch.unsupportedSetting')
    expect(() => build(fixtures.anthropic, { searchMode: 'enable', searchDepth: 'custom', maxResults: 21 })).toThrow('errors.webSearch.invalidMaxResults')
    expect(() => build(fixtures.responses, { searchMode: 'enable', searchDepth: 'custom', maxResults: 3 })).toThrow('errors.webSearch.unsupportedSetting')
  })
  it('keeps dormant unsupported intent disabled', () => {
    expect(build(null, { searchMode: 'disable', maxResults: 20, searchEngine: 'exa' })).toEqual({ mode: 'disabled' })
  })
  it('uses registered wire bounds for domain-less support and encoded unknown without changing fact labels', () => {
    const value = { ...fixtures.anthropic, controls: { ...fixtures.anthropic.controls,
      'web.mode': { ...fixtures.anthropic.controls['web.mode'], domain: undefined },
      'web.types': { ...fixtures.anthropic.controls['web.types'], domain: undefined },
      'web.maxResults': { ...fixtures.anthropic.controls['web.maxResults'], state: 'unknown' as const, domain: undefined } } }
    expect(build(value, { searchMode: 'enable', searchDepth: 'custom', maxResults: 20 })).toEqual({ mode: 'provider_search', types: ['web'], maxResults: 20 })
    expect(value.controls['web.maxResults'].state).toBe('unknown')
    expect(() => build(value, { searchMode: 'enable', searchDepth: 'custom', maxResults: 21 })).toThrow('errors.webSearch.invalidMaxResults')
    const stringContext = { ...fixtures.responses, controls: { ...fixtures.responses.controls,
      'web.searchContextSize': { ...fixtures.responses.controls['web.searchContextSize'], domain: undefined } } }
    expect(projectGenerationV2WebSearchControls(stringContext).contexts).toEqual(['low', 'medium', 'high'])
  })
  it('rejects explicit presets outside a narrowed model domain instead of silently omitting them', () => {
    const narrowed = projection('anthropic', 'anthropic-messages-2023-06-01', { 'web.maxResults': { kind: 'range', min: 1, max: 5, integer: true } })
    expect(() => build(narrowed, { searchMode: 'enable', searchDepth: 'high' })).toThrow('errors.webSearch.unsupportedSetting')
    expect(build(narrowed, { searchMode: 'enable', searchDepth: 'low' }).maxResults).toBe(3)
  })
  it('fails closed for wrong binding, unknown registry and unsupported/conflicting model fields', () => {
    expect(() => buildGenerationV2WebSearch({ projection: fixtures.anthropic, expectedBinding: { providerId: 'anthropic', modelId: 'other', operation: 'text' },
      layers: { convo: { searchMode: 'enable' } } })).toThrow('errors.webSearch.capabilityUnavailable')
    expect(() => build({ ...fixtures.anthropic, binding: { ...fixtures.anthropic.binding, protocolContractId: 'unknown' } })).toThrow('errors.webSearch.capabilityUnavailable')
    for (const state of ['missing', 'conflict', 'unsupported'] as const) {
      const value = { ...fixtures.anthropic, controls: { ...fixtures.anthropic.controls, 'web.mode': { ...fixtures.anthropic.controls['web.mode'], state } } }
      expect(() => build(value)).toThrow('errors.webSearch.unsupportedSetting')
    }
  })
  it('preserves Interactions image mode/types without legacy optional defaults', () => {
    const value = { ...fixtures.gemini, binding: { ...fixtures.gemini.binding, protocolContractId: 'gemini-interactions-v1beta', operation: 'image_generate' },
      controls: { ...fixtures.gemini.controls, 'web.types': { ...fixtures.gemini.controls['web.types'], domain: { kind: 'enum_list' as const, values: ['web', 'image'], maxItems: 2 } } } }
    expect(buildGenerationV2WebSearch({ projection: value, expectedBinding: { providerId: 'google_ai_studio', modelId: 'model:test', operation: 'image_generate' },
      layers: { global: { searchDepth: 'high', searchEngine: 'exa' } }, googleSearch: true, imageSearch: true })).toEqual({ mode: 'provider_search', types: ['web', 'image'] })
  })
})
