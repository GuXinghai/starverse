import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REASONING_PREFS,
  buildReasoningPrefsSavePlan,
  extractReasoningPrefs,
  mergeReasoningPrefsIntoMeta,
  normalizeReasoningPrefs,
  resolveReasoningPrefsFromStoredLayers,
} from './reasoningPrefsScope'

describe('reasoningPrefsScope', () => {
  it('normalizes stored prefs and preserves explicit effort mode', () => {
    expect(normalizeReasoningPrefs({ mode: 'effort', effort: 'high', exclude: true })).toEqual({
      mode: 'effort',
      effort: 'high',
      exclude: true,
    })
    expect(normalizeReasoningPrefs({ mode: 'effort', effort: 'auto', exclude: true })).toEqual({
      mode: 'effort',
      effort: 'none',
      exclude: false,
    })
    expect(normalizeReasoningPrefs({ mode: 'auto', effort: 'high', exclude: true })).toEqual(DEFAULT_REASONING_PREFS)
  })

  it('extracts, merges and resolves conversation > project > global > default precedence', () => {
    expect(extractReasoningPrefs({ reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: true } })).toEqual({
      mode: 'effort',
      effort: 'medium',
      exclude: true,
    })

    expect(mergeReasoningPrefsIntoMeta({ keep: 1 }, { mode: 'effort', effort: 'low', exclude: true })).toEqual({
      keep: 1,
      reasoningPrefs: { mode: 'effort', effort: 'low', exclude: true },
    })

    const resolved = resolveReasoningPrefsFromStoredLayers({
      convoMeta: { reasoningPrefs: { mode: 'auto', effort: 'high', exclude: true } },
      projectMeta: { reasoningPrefs: { mode: 'effort', effort: 'medium', exclude: true } },
      globalPrefs: { mode: 'effort', effort: 'low', exclude: false },
    })

    expect(resolved.convoLayer).toEqual(DEFAULT_REASONING_PREFS)
    expect(resolved.projectLayer).toEqual({ mode: 'effort', effort: 'medium', exclude: true })
    expect(resolved.globalLayer).toEqual({ mode: 'effort', effort: 'low', exclude: false })
    expect(resolved.resolved).toEqual(DEFAULT_REASONING_PREFS)
    expect(resolved.source).toBe('conversation')
  })

  it('builds an explicit save plan for the no-project global mirror exception', () => {
    expect(buildReasoningPrefsSavePlan({
      convoMeta: { keep: 1 },
      convoProjectId: null,
      prefs: { mode: 'effort', effort: 'high', exclude: true },
    })).toEqual({
      nextConvoMeta: {
        keep: 1,
        reasoningPrefs: { mode: 'effort', effort: 'high', exclude: true },
      },
      normalizedPrefs: { mode: 'effort', effort: 'high', exclude: true },
      shouldMirrorToGlobalDefault: true,
      globalMirrorReason: 'missing_project',
    })

    expect(buildReasoningPrefsSavePlan({
      convoMeta: null,
      convoProjectId: 'p1',
      prefs: { mode: 'effort', effort: 'high', exclude: true },
    })).toMatchObject({
      shouldMirrorToGlobalDefault: false,
      globalMirrorReason: 'scoped_conversation',
    })
  })
})
