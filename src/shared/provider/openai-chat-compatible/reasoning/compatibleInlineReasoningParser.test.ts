import { describe, expect, it } from 'vitest'
import { CompatibleInlineReasoningParser, projectCompatibleInlineBlocks, reconcileCompatibleInlineFinal, validateCompatibleInlineTags } from './compatibleInlineReasoningParser'
import { CompatibleReasoningSourceLock } from './reasoningSourceLock'

const parseChunks = (chunks: readonly string[]) => {
  const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'route', choiceIndex: 0 })
  for (const chunk of chunks) parser.push(chunk)
  return parser.finalize()
}

describe('CompatibleInlineReasoningParser', () => {
  it('parses canonical tags split at every character boundary with stable blocks', () => {
    const text = 'before<think>reasoning</think>after'
    for (let index = 0; index <= text.length; index += 1) {
      expect(parseChunks([text.slice(0, index), text.slice(index)]).blocks).toEqual([
        expect.objectContaining({ blockId: 'route:0:inline-content:0', kind: 'content', text: 'before' }),
        expect.objectContaining({ blockId: 'route:0:inline-reasoning:0', kind: 'reasoning', text: 'reasoning' }),
        expect.objectContaining({ blockId: 'route:0:inline-content:2', kind: 'content', text: 'after' }),
      ])
    }
  })

  it('supports multiple completed segments without token-per-block output', () => {
    expect(parseChunks(['<think>a</think>x<think>b</think>']).blocks).toEqual([
      expect.objectContaining({ kind: 'reasoning', text: 'a', segmentOrdinal: 0 }),
      expect.objectContaining({ kind: 'content', text: 'x', segmentOrdinal: 1 }),
      expect.objectContaining({ kind: 'reasoning', text: 'b', segmentOrdinal: 2 }),
    ])
  })

  it('restores incomplete segments to content at EOF', () => {
    expect(parseChunks(['x<think>unfinished'])).toEqual({
      blocks: [expect.objectContaining({ kind: 'content', text: 'x<think>unfinished' })],
      diagnostics: ['incomplete_segment_restored'],
      pending: false,
    })
  })

  it('keeps a possible start prefix pending and restores it at EOF', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    expect(parser.push('x<thi')).toMatchObject({ blocks: [expect.objectContaining({ text: 'x' })], pending: true })
    const final = parser.finalize()
    expect(final.blocks).toEqual([expect.objectContaining({ text: 'x<thi' })])
    expect(parser.finalize()).toBe(final)
  })

  it.each(['eof', 'abort', 'interrupted'] as const)('restores a partial opening tag with diagnostics on %s', (outcome) => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    parser.push('before<thi', 3)
    expect(parser.terminate(outcome)).toEqual({ blocks: [expect.objectContaining({ kind: 'content', text: 'before<thi' })], diagnostics: ['incomplete_segment_restored'], pending: false })
  })

  it('does not diagnose ordinary XML-like literal text as a partial configured tag', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    parser.push('<not-a-tag')
    expect(parser.finalize()).toMatchObject({ blocks: [expect.objectContaining({ text: '<not-a-tag' })], diagnostics: [] })
  })

  it('diagnoses a partial custom opening tag at termination', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0, customTags: [{ openTag: 'BEGIN_REASONING', closeTag: 'END_REASONING' }] })
    parser.push('BEGIN_REAS')
    expect(parser.terminate('abort')).toMatchObject({ blocks: [expect.objectContaining({ text: 'BEGIN_REAS' })], diagnostics: ['incomplete_segment_restored'] })
  })

  it('keeps unmatched closes and fenced tags literal', () => {
    const result = parseChunks(['a</think>\n```xml\n<think>x</think>\n```\n'])
    expect(result.blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'a</think>\n```xml\n<think>x</think>\n```\n' })])
    expect(result.diagnostics).toContain('unmatched_end_literal')
  })

  it('keeps tags inside inline code spans literal', () => {
    expect(parseChunks(['before `<think>x</think>` after']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'before `<think>x</think>` after' })])
    expect(parseChunks(['before ``a`<think>x</think>`` after']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'before ``a`<think>x</think>`` after' })])
    expect(parseChunks(['before ```<think>x</think>``` after']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'before ```<think>x</think>``` after' })])
  })
  it('keeps escaped tag examples literal', () => {
    expect(parseChunks(['example \\<think>x</think>']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'example \\<think>x</think>' })])
  })
  it('keeps ordinary and XML/HTML examples literal', () => {
    expect(parseChunks(['Example: <think>x</think>']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'Example: <think>x</think>' })])
    expect(parseChunks(['<root><think>x</think></root>']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: '<root><think>x</think></root>' })])
    expect(parseChunks(['HTML: ', '<think>x</think>']).blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'HTML: <think>x</think>' })])
  })

  it('records monotonic sequence ranges for cross-chunk segments', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    parser.push('a<think>x', 10)
    parser.push('y</think>b', 12)
    expect(parser.finalize().blocks).toEqual([
      expect.objectContaining({ kind: 'content', text: 'a', sequenceStart: 10, sequenceEnd: 10 }),
      expect.objectContaining({ kind: 'reasoning', text: 'xy', sequenceStart: 10, sequenceEnd: 12 }),
      expect.objectContaining({ kind: 'content', text: 'b', sequenceStart: 12, sequenceEnd: 12 }),
    ])
  })

  it('feeds inline as the lowest-priority candidate in the same event', () => {
    const context = { routeProvenanceId: 'route', messageId: 'a1', providerInstanceId: 'provider', responseProfileId: 'profile', responseProfileVersion: 1, allowedMappings: [] } as const
    const parsed = parseChunks(['<think>inline</think>'])
    const inline = projectCompatibleInlineBlocks({ context, choiceIndex: 0, blocks: parsed.blocks })[0]!
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.acceptEvent([{ ...inline, sequence: 1 }, { ...inline, sequence: 1, source: 'reasoning', sourceKey: 'reasoning', value: 'structured' }])).toMatchObject({ lockedSource: 'reasoning', value: 'structured', conflicts: [expect.objectContaining({ kind: 'structured_and_inline_overlap' })] })
  })

  it('reconciles only matching final segment identity and empty final cannot clear stream', () => {
    const stream = parseChunks(['<think>stream</think>']).blocks
    expect(reconcileCompatibleInlineFinal({ streamBlocks: stream, finalBlocks: [] }).blocks).toEqual(stream)
    const mismatch = stream.map((block) => block.kind === 'reasoning' ? { ...block, tagPairId: 'other' } : block)
    expect(reconcileCompatibleInlineFinal({ streamBlocks: stream, finalBlocks: mismatch })).toEqual({ blocks: stream, diagnostics: ['final_snapshot_mismatch'] })
  })

  it('preserves every inline segment through TP11 final reconciliation', () => {
    const context = { routeProvenanceId: 'route', messageId: 'a1', providerInstanceId: 'provider', responseProfileId: 'profile', responseProfileVersion: 1, allowedMappings: [] } as const
    const blocks = parseChunks(['<think>a</think>x<think>b</think>']).blocks
    const stream = projectCompatibleInlineBlocks({ context, choiceIndex: 0, blocks }).map((candidate, index) => ({ ...candidate, sequence: index + 1 }))
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.acceptEvent(stream.map((candidate) => ({ ...candidate, sequence: 1 })))).toMatchObject({ value: 'ab', selectedSegmentIds: ['route:0:inline-reasoning:0', 'route:0:inline-reasoning:1'] })
    expect(lock.finalize(stream.map((candidate) => ({ ...candidate, phase: 'final' as const, mode: 'snapshot' as const, sequence: 2 })))).toMatchObject({ value: 'ab', selectedSegmentIds: ['route:0:inline-reasoning:0', 'route:0:inline-reasoning:1'] })
  })

  it('does not recurse on nested starts', () => {
    const result = parseChunks(['<think>a<think>b</think>'])
    expect(result.blocks).toEqual([expect.objectContaining({ kind: 'reasoning', text: 'a<think>b' })])
    expect(result.diagnostics).toContain('nested_start_literal')
  })

  it('supports additive custom tags and preserves canonical support', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 1, inlinePolicyId: 'policy', inlinePolicyVersion: 2, customTags: [{ openTag: '<analysis>', closeTag: '</analysis>' }] })
    parser.push('<analysis>a</analysis><think>b</think>')
    expect(parser.finalize().blocks.map((block) => block.text)).toEqual(['a', 'b'])
    expect(parser.finalize).toBeTypeOf('function')
  })

  it.each(['custom_only', 'structured_locked'] as const)('keeps tags literal when participation is %s', (participation) => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0, participation })
    parser.push('x<think>r</think>')
    expect(parser.finalize().blocks).toEqual([expect.objectContaining({ kind: 'content', text: 'x<think>r</think>', tagPairId: null })])
  })

  it('rejects conflicting, prefix and excessive custom policies', () => {
    expect(() => validateCompatibleInlineTags([{ openTag: '<think>', closeTag: '</x>' }])).toThrow(/conflict/)
    expect(() => validateCompatibleInlineTags([{ openTag: '<abc>', closeTag: '<abc>x' }])).toThrow(/prefix/)
    expect(() => validateCompatibleInlineTags(Array.from({ length: 17 }, (_, index) => ({ openTag: `<a${index}>`, closeTag: `</a${index}>` })))).toThrow(/limit/)
    expect(() => validateCompatibleInlineTags([{ openTag: '```think', closeTag: '```' }])).toThrow(/invalid/)
    expect(() => validateCompatibleInlineTags([{ openTag: '  ```think', closeTag: '  ```' }])).toThrow(/invalid/)
    expect(() => validateCompatibleInlineTags([{ openTag: ' ~~~think', closeTag: ' ~~~' }])).toThrow(/invalid/)
  })

  it('rejects overflow before mutating accepted text', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const accepted = 'x'.repeat(2 * 1024 * 1024)
    parser.push(accepted, 1)
    expect(() => parser.push('rejected', 2)).toThrow(/input_overflow/)
    expect(parser.finalize().blocks).toEqual([expect.objectContaining({ text: accepted, sequenceEnd: 1 })])
  })
  it('handles a near-limit run of unmatched XML prefixes within the bounded scan path', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const text = '<'.repeat(2 * 1024 * 1024 - 1)
    parser.push(text, 1)
    expect(parser.finalize().blocks).toEqual([expect.objectContaining({ text })])
  })

  it.each(['abort', 'interrupted'] as const)('restores an incomplete segment on %s and is terminal-idempotent', (outcome) => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    parser.push('before<think>unfinished', 4)
    const terminal = parser.terminate(outcome)
    expect(terminal).toEqual({ blocks: [expect.objectContaining({ kind: 'content', text: 'before<think>unfinished' })], diagnostics: ['incomplete_segment_restored'], pending: false })
    expect(parser.terminate(outcome)).toBe(terminal)
    expect(() => parser.push('late', 5)).toThrow(/terminal/)
  })

  it('parses Unicode custom tags across every UTF-16 code-unit boundary', () => {
    const text = 'a🧠思考b结束🧠c'
    for (let index = 0; index <= text.length; index += 1) {
      const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0, customTags: [{ openTag: '🧠思考', closeTag: '结束🧠' }] })
      parser.push(text.slice(0, index), 1)
      parser.push(text.slice(index), 2)
      expect(parser.finalize().blocks.map(({ kind, text: value }) => ({ kind, text: value }))).toEqual([{ kind: 'content', text: 'a' }, { kind: 'reasoning', text: 'b' }, { kind: 'content', text: 'c' }])
    }
  })

  it('counts a surrogate split inside reasoning with whole-string UTF-8 semantics at the 1 MiB boundary', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const reasoning = '🧠'.repeat(256 * 1024)
    parser.push(`<think>${reasoning[0]}`, 1)
    parser.push(`${reasoning.slice(1)}</think>`, 2)
    expect(parser.finalize().blocks).toEqual([expect.objectContaining({ kind: 'reasoning', text: reasoning })])
  })

  it('keeps semantic block identity stable across one-byte chunking', () => {
    const text = 'before<think>reasoning</think>after'
    const single = parseChunks([text]).blocks.map(({ sequenceStart: _start, sequenceEnd: _end, ...block }) => block)
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'route', choiceIndex: 0 })
    ;[...text].forEach((char, sequence) => parser.push(char, sequence))
    const chunked = parser.finalize().blocks.map(({ sequenceStart: _start, sequenceEnd: _end, ...block }) => block)
    expect(chunked).toEqual(single)
  })


  it('releases an over-limit XML-like prefix during streaming instead of waiting for EOF', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const text = `<a${'x'.repeat(300)}`
    expect(parser.push(text, 1)).toMatchObject({ blocks: [expect.objectContaining({ text })], pending: false })
  })


  it('releases a long backtick run during streaming with bounded pending state', () => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const text = '`'.repeat(300)
    expect(parser.push(text, 1)).toMatchObject({ blocks: [expect.objectContaining({ text })], pending: true })
  })

  it.each(['`', '~'] as const)('keeps exact long %s fence width across a shorter pseudo-close', (marker) => {
    const parser = new CompatibleInlineReasoningParser({ routeProvenanceId: 'r', choiceIndex: 0 })
    const text = `${marker.repeat(300)}\n${marker.repeat(256)}\n<think>literal</think>\n${marker.repeat(300)}\n`
    parser.push(text.slice(0, 200), 1)
    parser.push(text.slice(200), 2)
    expect(parser.finalize()).toMatchObject({ blocks: [expect.objectContaining({ kind: 'content', text })], diagnostics: [] })
  })
})
