import { describe, expect, it } from 'vitest'
import { mergeMetaWithReasoning, safeParseMessageMeta } from './messageMetaMerge'

describe('messageMetaMerge', () => {
  it('returns null when meta is empty and no reasoning fields are provided', () => {
    expect(mergeMetaWithReasoning(null, null, null, undefined, undefined, undefined)).toBeNull()
    expect(mergeMetaWithReasoning({}, null, null, undefined, undefined, undefined)).toBeNull()
  })

  it('merges reasoningDetailsRaw only when reasoningDetailsFinalJson exists and meta does not already have it', () => {
    const noReasoning = mergeMetaWithReasoning({ keep: 1 }, '', null)
    expect(noReasoning).toEqual({ keep: 1 })

    const withReasoning = mergeMetaWithReasoning(null, '[{"kind":"r"}]', null)
    expect(withReasoning).toEqual({ reasoningDetailsRaw: [{ kind: 'r' }] })
  })

  it('merges requestReasoningConfig when requestReasoningConfigJson exists', () => {
    const noRequest = mergeMetaWithReasoning({ keep: true }, null, '')
    expect(noRequest).toEqual({ keep: true })

    const withRequest = mergeMetaWithReasoning({ keep: true }, null, '{"effort":"high"}')
    expect(withRequest).toEqual({
      keep: true,
      requestReasoningConfig: { effort: 'high' },
    })
  })

  it('keeps reasoningDetailsRaw priority but allows requestReasoningConfig to update when both are present', () => {
    const merged = mergeMetaWithReasoning(
      {
        reasoningDetailsRaw: [{ source: 'meta' }],
        requestReasoningConfig: { from: 'meta' },
      },
      '[{"source":"json"}]',
      '{"from":"request"}',
    )

    expect(merged).toEqual({
      reasoningDetailsRaw: [{ source: 'meta' }],
      requestReasoningConfig: { from: 'request' },
    })
  })

  it('ignores invalid JSON inputs and keeps existing fields', () => {
    const merged = mergeMetaWithReasoning(
      { keep: 'ok' },
      '{bad-json',
      '{also-bad',
      null,
      '',
      0,
    )

    expect(merged).toEqual({
      keep: 'ok',
      reasoningDurationMs: null,
    })
  })

  it('does not accidentally overwrite unrelated existing fields', () => {
    const merged = mergeMetaWithReasoning(
      {
        keep: 'safe',
        reasoningEndReason: 'old',
      },
      null,
      null,
      undefined,
      '',
      undefined,
    )

    expect(merged).toEqual({
      keep: 'safe',
      reasoningEndReason: 'old',
    })
  })

  it('safeParseMessageMeta keeps legacy tolerant parsing behavior', () => {
    expect(safeParseMessageMeta('{"a":1}')).toEqual({ a: 1 })
    expect(safeParseMessageMeta('[1,2]')).toEqual([1, 2])
    expect(safeParseMessageMeta('{oops')).toBeNull()
  })
})

