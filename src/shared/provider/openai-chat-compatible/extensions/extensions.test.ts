import { describe, expect, it } from 'vitest'
import {
  aggregateCompatibleDiscovery,
  coalesceCompatibleRawExtensions,
  compatibleExtensionPathMatches,
  extractOpenAICompatibleExtensions,
  normalizeCompatibleExtensionPath,
  parseCompatibleExtensionPath,
  redactCompatibleExtensionValue,
} from './index'
import type { CompatibleWireEvent } from '../wire'

const context = { routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [{ mappingId: 'm1', mappingVersion: 1 }] } as const

describe('compatible extension path DSL', () => {
  it('supports bounded literal/index/wildcard paths', () => {
    const path = parseCompatibleExtensionPath('choices.*.delta.vendor_reasoning')
    expect(compatibleExtensionPathMatches(path, ['choices', 2, 'delta', 'vendor_reasoning'])).toBe(true)
    expect(normalizeCompatibleExtensionPath(['choices', 2, 'delta', 'vendor_reasoning'])).toBe('choices.2.delta.vendor_reasoning')
  })

  it.each(['', 'a[0]', '$.a', 'a..b', '__proto__.x', 'a.constructor', '/a/', 'a()', 'a.*.b.*.c.*.d.*.e.*.f.*.g.*.h.*.i.*.j.*.k.*.l.*.m.*.n.*.o.*.p.*.q'])('rejects executable, prototype or excessive syntax: %s', (path) => {
    expect(() => parseCompatibleExtensionPath(path)).toThrow(/path_invalid/)
  })
})

describe('compatible extension extraction', () => {
  const events: CompatibleWireEvent[] = [
    { kind: 'extension', sequence: 1, source: 'stream', candidate: { sourcePath: ['choices', 0, 'delta', 'vendor_reasoning'], choiceIndex: 0, value: 'a' } },
    { kind: 'choice_content', sequence: 2, source: 'stream', choiceIndex: 0, content: 'answer' },
    { kind: 'extension', sequence: 3, source: 'stream', candidate: { sourcePath: ['choices', 0, 'delta', 'trace'], choiceIndex: 0, value: { id: 'public' } } },
  ]

  it('separates profile-matched semantics from observation-only discovery', () => {
    const result = extractOpenAICompatibleExtensions({ context, events, mappings: [{ mappingId: 'm1', mappingVersion: 1, responseProfileId: context.responseProfileId, responseProfileVersion: 1, path: 'choices.*.delta.vendor_reasoning', semantic: 'reasoning', mode: 'append' }] })
    expect(result.semanticCandidates).toHaveLength(1)
    expect(result.semanticCandidates[0]).toMatchObject({ mappingId: 'm1', semantic: 'reasoning', value: 'a' })
    expect(result.discoveryObservations).toEqual([expect.objectContaining({ normalizedPath: 'choices.0.payload.trace', timing: 'after_content' })])
  })

  it('does not reinterpret current observations after a future mapping is supplied', () => {
    const before = extractOpenAICompatibleExtensions({ context, events, mappings: [] })
    expect(() => extractOpenAICompatibleExtensions({ context, events, mappings: [{ mappingId: 'future', mappingVersion: 2, responseProfileId: context.responseProfileId, responseProfileVersion: 2, path: 'choices.*.delta.vendor_reasoning', semantic: 'reasoning', mode: 'append' }] })).toThrow(/profile_mismatch/)
    expect(() => extractOpenAICompatibleExtensions({ context, events, mappings: [{ mappingId: 'future', mappingVersion: 2, responseProfileId: context.responseProfileId, responseProfileVersion: 1, path: 'choices.*.delta.vendor_reasoning', semantic: 'reasoning', mode: 'append' }] })).toThrow(/not_pinned/)
    const after = extractOpenAICompatibleExtensions({ context, events, mappings: [] })
    expect(before.semanticCandidates).toEqual([])
    expect(before.observations).toEqual(after.observations)
  })

  it('snapshots route/profile identity instead of retaining mutable caller state', () => {
    const mutable = { ...context, allowedMappings: [{ mappingId: 'm1', mappingVersion: 1 }] }
    const result = extractOpenAICompatibleExtensions({ context: mutable, events, mappings: [] })
    mutable.allowedMappings[0]!.mappingVersion = 99
    expect(result.observations[0]?.context.allowedMappings[0]?.mappingVersion).toBe(1)
    expect(result.discoveryObservations[0]?.context.routeProvenanceId).toBe(context.routeProvenanceId)
  })
})

describe('compatible raw retention', () => {
  it('redacts nested secrets, opaque/signature fields and secret-like values', () => {
    expect(redactCompatibleExtensionValue({ nested: { authorization: 'Bearer abc', signature: 'opaque', safe: 'ok' }, tokenish: 'sk_123456789' }).value).toEqual({
      nested: { authorization: '[redacted]', signature: '[redacted]', safe: '[redacted]' },
      tokenish: '[redacted]',
    })
    expect(coalesceCompatibleRawExtensions(context, [{ context, sequence: 1, sourcePath: ['choices', 0, 'delta', 'signature'], value: 'not-obviously-secret' }]).records[0]?.value).toBe('[redacted]')
  })

  it('coalesces append deltas and replaces snapshots', () => {
    const result = coalesceCompatibleRawExtensions(context, [
      { context, sequence: 1, choiceIndex: 0, sourcePath: ['x'], value: 'a', mode: 'append' },
      { context, sequence: 2, choiceIndex: 0, sourcePath: ['x'], value: 'b', mode: 'append' },
      { context, sequence: 3, choiceIndex: 0, sourcePath: ['y'], value: { n: 1 }, mode: 'snapshot' },
      { context, sequence: 4, choiceIndex: 0, sourcePath: ['y'], value: { n: 2 }, mode: 'snapshot' },
    ])
    expect(result.records).toEqual([
      expect.objectContaining({ sourcePath: 'x', sequenceStart: 1, sequenceEnd: 2, value: '[redacted]' }),
      expect.objectContaining({ sourcePath: 'y', sequenceStart: 3, sequenceEnd: 4, value: { n: 2 } }),
    ])
  })

  it('reports rather than silently retaining an oversized record', () => {
    const result = coalesceCompatibleRawExtensions(context, [{ context, sequence: 1, sourcePath: ['large'], value: Array.from({ length: 10_000 }, (_, index) => index) }])
    expect(result).toMatchObject({ droppedCount: 1, complete: false })
    expect(result.records).toEqual([expect.objectContaining({ sourcePath: '$overflow', redactionState: 'dropped' })])
  })

  it('reserves a durable summary slot when 257 unique records are observed', () => {
    const result = coalesceCompatibleRawExtensions(context, Array.from({ length: 257 }, (_, index) => ({ context, sequence: index, sourcePath: [`field_${index}`], value: index })))
    expect(result).toMatchObject({ droppedCount: 2, complete: false })
    expect(result.records).toHaveLength(256)
    expect(result.records.at(-1)).toMatchObject({ sourcePath: '$overflow', redactionState: 'dropped', value: { dropped: { count: 2 } } })
  })

  it('reserves byte budget for a durable overflow summary', () => {
    const value = Array.from({ length: 3_500 }, (_, index) => index)
    const result = coalesceCompatibleRawExtensions(context, Array.from({ length: 30 }, (_, index) => ({ context, sequence: index, sourcePath: [`bytes_${index}`], value })))
    expect(result.complete).toBe(false)
    expect(result.records.at(-1)).toMatchObject({ sourcePath: '$overflow', redactionState: 'dropped' })
    expect(result.records.reduce((total, record) => total + record.valueBytes, 0)).toBeLessThanOrEqual(256 * 1024)
  })

  it('rejects mixed response identity and snapshots the draft context', () => {
    const mutable = { ...context, allowedMappings: [...context.allowedMappings] }
    expect(() => coalesceCompatibleRawExtensions(mutable, [{ context: { ...mutable, messageId: 'other' }, sequence: 1, sourcePath: ['x'], value: 1 }])).toThrow(/identity_mismatch/)
    const result = coalesceCompatibleRawExtensions(mutable, [{ context: mutable, sequence: 1, sourcePath: ['x'], value: 1 }])
    ;(mutable as { responseProfileVersion: number }).responseProfileVersion = 2
    expect(result.records[0]?.context.responseProfileVersion).toBe(1)
  })
})

describe('compatible discovery aggregation', () => {
  it('calculates shape/timing/pairing confidence without name heuristics', () => {
    const aggregate = aggregateCompatibleDiscovery([
      { context, normalizedPath: 'choices.0.delta.vendor_field', source: 'stream', shape: 'string', nonEmpty: true, timing: 'before_content', preview: 'a' },
      { context, normalizedPath: 'choices.0.delta.vendor_field', source: 'non_stream', shape: 'string', nonEmpty: true, timing: 'after_content', preview: 'a' },
    ]).get('choices.0.delta.vendor_field')
    expect(aggregate).toMatchObject({ sampleCount: 2, nonEmptySampleCount: 2, streamFinalPaired: true, confidence: 1, excluded: false })
  })

  it('normalizes stream delta and final message paths for pairing', () => {
    const stream = extractOpenAICompatibleExtensions({ context, events: [{ kind: 'extension', sequence: 1, source: 'stream', candidate: { sourcePath: ['choices', 0, 'delta', 'vendor'] , value: 'x' } }], mappings: [] })
    const final = extractOpenAICompatibleExtensions({ context, events: [{ kind: 'extension', sequence: 1, source: 'non_stream', candidate: { sourcePath: ['choices', 0, 'message', 'vendor'], value: 'x' } }], mappings: [] })
    expect(stream.discoveryObservations[0]?.normalizedPath).toBe(final.discoveryObservations[0]?.normalizedPath)
  })

  it('excludes known semantic families and built-in reasoning from candidacy', () => {
    const result = aggregateCompatibleDiscovery([
      { context, normalizedPath: 'choices.0.delta.reasoning_content', source: 'stream', shape: 'string', nonEmpty: true, timing: 'unknown', preview: 'x' },
      { context, normalizedPath: 'choices.0.delta.citations', source: 'stream', shape: 'array', nonEmpty: true, timing: 'unknown', preview: null },
    ])
    expect(result.has('choices.0.delta.reasoning_content')).toBe(false)
    expect(result.get('choices.0.delta.citations')?.excluded).toBe(true)
  })
})
