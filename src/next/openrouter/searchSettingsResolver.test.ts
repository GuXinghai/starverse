import { describe, expect, it } from 'vitest'
import { resolveSearchSettings } from './searchSettingsResolver'

describe('resolveSearchSettings', () => {
  it('applies hierarchy precedence: convo > project > global', () => {
    const resolved = resolveSearchSettings({
      convo: { searchMode: 'enable' },
      project: { searchMode: 'disable' },
      global: { searchMode: 'disable' },
    })

    expect(resolved.resolvedMode).toBe('enable')
    expect(resolved.effectiveMode).toBe(true)
    expect(resolved.requestPatch.plugins?.[0]).toMatchObject({ id: 'web', enabled: true })
  })

  it('keeps mode=default as inherit and falls back to account default', () => {
    const off = resolveSearchSettings(
      {
        convo: { searchMode: 'default' },
        project: { searchMode: 'default' },
        global: { searchMode: 'default' },
      },
      { accountDefaultEnabled: false }
    )
    expect(off.resolvedMode).toBe('default')
    expect(off.effectiveMode).toBe(false)
    expect(off.requestPatch).toEqual({})

    const on = resolveSearchSettings(
      {
        convo: { searchMode: 'default' },
        project: { searchMode: 'default' },
        global: { searchMode: 'default' },
      },
      { accountDefaultEnabled: true }
    )
    expect(on.effectiveMode).toBe(true)
    expect(on.requestPatch).toEqual({})
  })

  it('resolves search engine with inherit semantics and keeps auto as empty effectiveEngine', () => {
    const auto = resolveSearchSettings({
      convo: { searchMode: 'enable', searchEngine: 'default' },
      project: { searchEngine: 'auto' },
      global: { searchEngine: 'exa' },
    })
    expect(auto.resolvedEngine).toBe('auto')
    expect(auto.effectiveEngine).toBe('')
    expect(auto.requestPatch.plugins?.[0]).not.toHaveProperty('engine')

    const exa = resolveSearchSettings({
      convo: { searchMode: 'enable', searchEngine: 'exa' },
    })
    expect(exa.effectiveEngine).toBe('exa')
    expect(exa.requestPatch.plugins?.[0]).toHaveProperty('engine', 'exa')
  })

  it('enforces depth mutual exclusivity: custom uses maxResults with clamp and context-size mapping', () => {
    const r1 = resolveSearchSettings({
      convo: { searchMode: 'enable', searchDepth: 'custom', maxResults: 0 },
      project: { searchDepth: 'high', maxResults: 9 },
    })
    expect(r1.resolvedDepth).toBe('custom')
    expect(r1.effectiveMaxResults).toBe(1)
    expect(r1.effectiveSearchContextSize).toBe('low')

    const r2 = resolveSearchSettings({
      convo: { searchMode: 'enable', searchDepth: 'custom', maxResults: 6 },
    })
    expect(r2.effectiveMaxResults).toBe(6)
    expect(r2.effectiveSearchContextSize).toBe('medium')

    const r3 = resolveSearchSettings({
      convo: { searchMode: 'enable', searchDepth: 'custom', maxResults: 999 },
    })
    expect(r3.effectiveMaxResults).toBe(10)
    expect(r3.effectiveSearchContextSize).toBe('high')
  })

  it('enforces reverse exclusivity: non-custom depth ignores maxResults meaning', () => {
    const resolved = resolveSearchSettings({
      convo: { searchMode: 'enable', searchDepth: 'low', maxResults: 10 },
      project: { searchDepth: 'custom', maxResults: 9 },
    })
    expect(resolved.resolvedDepth).toBe('low')
    expect(resolved.effectiveMaxResults).toBe(3)
    expect(resolved.effectiveSearchContextSize).toBe('low')
    expect(resolved.requestPatch.plugins?.[0]).toHaveProperty('max_results', 3)
  })

  it('builds disable patch with hard off semantics', () => {
    const resolved = resolveSearchSettings({
      convo: { searchMode: 'disable', searchDepth: 'high', searchEngine: 'exa', maxResults: 10 },
    })

    expect(resolved.effectiveMode).toBe(false)
    expect(resolved.requestPatch).toEqual({
      plugins: [{ id: 'web', enabled: false }],
    })
  })

  it('supports prompt extension point: preset and custom text', () => {
    const preset = resolveSearchSettings(
      {
        convo: {
          searchMode: 'enable',
          searchPrompt: { mode: 'useStarversePreset' },
        },
      },
      { starverseSearchPromptPreset: 'preset text' }
    )
    expect(preset.effectiveSearchPrompt).toBe('preset text')
    expect(preset.requestPatch.plugins?.[0]).toHaveProperty('search_prompt', 'preset text')

    const custom = resolveSearchSettings({
      convo: {
        searchMode: 'enable',
        searchPrompt: { mode: 'customText', text: '  custom prompt  ' },
      },
    })
    expect(custom.effectiveSearchPrompt).toBe('custom prompt')
    expect(custom.requestPatch.plugins?.[0]).toHaveProperty('search_prompt', 'custom prompt')
  })

  it('produces deterministic request patch for enable mode (plugins + web_search_options)', () => {
    const resolved = resolveSearchSettings({
      convo: {
        searchMode: 'enable',
        searchDepth: 'high',
        searchEngine: 'native',
      },
    })

    expect(resolved.requestPatch).toEqual({
      plugins: [
        {
          id: 'web',
          enabled: true,
          engine: 'native',
          max_results: 8,
        },
      ],
      web_search_options: { search_context_size: 'high' },
    })
  })
})

