import { describe, expect, it } from 'vitest'
import {
  extractConvoWebSearchOverride,
  extractProjectWebSearchDefaults,
  mergeConvoWebSearchOverrideMeta,
  mergeProjectWebSearchDefaultsMeta,
  normalizeSearchSettingsLayer,
  resolveSearchSettingsFromStoredLayers,
} from './searchSettingsPersistence'

describe('searchSettingsPersistence', () => {
  it('normalizes and clamps layer fields', () => {
    const normalized = normalizeSearchSettingsLayer({
      searchMode: 'enable',
      searchDepth: 'custom',
      maxResults: 999,
      searchEngine: 'exa',
      searchPrompt: { mode: 'customText', text: '  focus recent docs  ' },
    })
    expect(normalized).toEqual({
      searchMode: 'enable',
      searchDepth: 'custom',
      maxResults: 10,
      searchEngine: 'exa',
      searchPrompt: { mode: 'customText', text: 'focus recent docs' },
    })
  })

  it('drops maxResults when depth is not custom', () => {
    const normalized = normalizeSearchSettingsLayer({
      searchDepth: 'medium',
      maxResults: 9,
    })
    expect(normalized).toEqual({ searchDepth: 'medium' })
  })

  it('extracts project/convo settings nodes from meta', () => {
    const project = extractProjectWebSearchDefaults({
      webSearchDefaults: { searchMode: 'enable', searchDepth: 'low' },
    })
    const convo = extractConvoWebSearchOverride({
      webSearchOverride: { searchMode: 'disable' },
    })
    expect(project).toEqual({ searchMode: 'enable', searchDepth: 'low' })
    expect(convo).toEqual({ searchMode: 'disable' })
  })

  it('merge helpers set/remove nodes while preserving unrelated meta keys', () => {
    const projectMeta = mergeProjectWebSearchDefaultsMeta(
      { keep: 1, webSearchDefaults: { searchMode: 'enable' } },
      null
    )
    const convoMeta = mergeConvoWebSearchOverrideMeta(
      { keep: 2 },
      { searchMode: 'enable', searchDepth: 'custom', maxResults: 6 }
    )
    expect(projectMeta).toEqual({ keep: 1 })
    expect(convoMeta).toEqual({
      keep: 2,
      webSearchOverride: { searchMode: 'enable', searchDepth: 'custom', maxResults: 6 },
    })
  })

  it('resolves hierarchy from stored layers (convo > project > global)', () => {
    const fromProject = resolveSearchSettingsFromStoredLayers({
      convoMeta: { webSearchOverride: { searchMode: 'default' } },
      projectMeta: { webSearchDefaults: { searchMode: 'enable', searchDepth: 'high' } },
      globalDefaults: { searchMode: 'disable' },
      options: { accountDefaultEnabled: false },
    })
    const afterProjectChange = resolveSearchSettingsFromStoredLayers({
      convoMeta: { webSearchOverride: { searchMode: 'default' } },
      projectMeta: { webSearchDefaults: { searchMode: 'default' } },
      globalDefaults: { searchMode: 'disable' },
      options: { accountDefaultEnabled: false },
    })

    expect(fromProject.effectiveMode).toBe(true)
    expect(afterProjectChange.effectiveMode).toBe(false)
  })

  it('treats missing legacy fields as default/inherit', () => {
    const resolved = resolveSearchSettingsFromStoredLayers({
      convoMeta: {},
      projectMeta: {},
      globalDefaults: null,
      options: { accountDefaultEnabled: true },
    })
    expect(resolved.resolvedMode).toBe('default')
    expect(resolved.effectiveMode).toBe(true)
  })
})
