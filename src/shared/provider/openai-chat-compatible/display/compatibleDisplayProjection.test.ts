import { describe, expect, it } from 'vitest'
import { buildCompatibleNetworkError } from '../../../network/compatibleNetworkError'
import type { CompatibleReasoningChoiceState } from '../reasoning'
import type { CompatibleToolAggregate } from '../tools'
import { CompatibleDisplayAssembler, compatibleDurableChoiceProjectionSchema } from './compatibleDisplayProjection'

const routeProvenanceId = 'ocp_route_12345678'
const messageId = 'assistant-1'

function assembler(): CompatibleDisplayAssembler {
  return new CompatibleDisplayAssembler({ routeProvenanceId, messageId, choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_preferred_with_builtin_fallback' })
}

function reasoningState(): CompatibleReasoningChoiceState {
  return {
    context: { routeProvenanceId, messageId, providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [] },
    choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback', status: 'locked', lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think', value: 'why', selectedSegmentIds: ['segment-1'], conflicts: [],
  }
}

function tool(sequenceEnd = 3): CompatibleToolAggregate {
  return { routeProvenanceId, messageId, choiceIndex: 0, toolIndex: 0, toolCallId: 'call-1', toolType: 'function', functionName: 'lookup', argumentsText: '{"q":"x"}', argumentsObserved: true, argumentsJson: '{"q":"x"}', status: 'complete', diagnosticCode: null, executionState: 'not_executed', sequenceStart: 3, sequenceEnd }
}

describe('CompatibleDisplayAssembler', () => {
  it('preserves content-reasoning-tool-content order with stable blocks and no token churn', () => {
    const value = assembler()
    value.appendContent('a', 1)
    value.appendContent('b', 1)
    value.upsertReasoning({ blockId: 'reasoning-1', segmentId: 'segment-1', text: 'why', sequenceStart: 2, sequenceEnd: 2, state: reasoningState() })
    value.upsertToolCall(tool())
    value.appendContent('c', 4)
    expect(value.snapshot().blocks.map((block) => [block.kind, block.blockId, 'text' in block ? block.text : null])).toEqual([
      ['content', `${routeProvenanceId}:0:content:0`, 'ab'], ['reasoning', 'reasoning-1', 'why'], ['tool_call', `${routeProvenanceId}:0:tool:0`, null], ['content', `${routeProvenanceId}:0:content:1`, 'c'],
    ])
  })

  it('upserts tool and reasoning identities without creating per-delta blocks', () => {
    const value = assembler()
    value.upsertReasoning({ blockId: 'reasoning-1', segmentId: 'segment-1', text: 'w', sequenceStart: 1, sequenceEnd: 1, state: reasoningState() })
    value.upsertReasoning({ blockId: 'reasoning-1', segmentId: 'segment-1', text: 'why', sequenceStart: 1, sequenceEnd: 2, state: reasoningState() })
    value.upsertToolCall({ ...tool(3), status: 'streaming', argumentsText: '{', argumentsObserved: true, argumentsJson: null })
    value.upsertToolCall(tool(4))
    expect(value.snapshot().blocks).toHaveLength(2)
    expect(value.snapshot().blocks).toEqual([expect.objectContaining({ blockId: 'reasoning-1', text: 'why' }), expect.objectContaining({ kind: 'tool_call', argumentsText: '{"q":"x"}', status: 'complete' })])
  })

  it('uses arrival suborder when different channels share one sequence', () => {
    const value = assembler()
    value.upsertReasoning({ blockId: 'reasoning-1', segmentId: 'segment-1', text: 'why', sequenceStart: 1, sequenceEnd: 1, state: reasoningState() })
    value.appendContent('answer', 1)
    expect(value.snapshot().blocks.map((block) => block.kind)).toEqual(['reasoning', 'content'])
  })

  it('labels usage provenance and freezes explicit terminal outcomes', () => {
    const value = assembler()
    value.setUsage({ prompt_tokens: 3 }, 'provider_reported', 1)
    value.setFinishReason('stop', 2)
    const done = value.terminate('completed')
    expect(done).toMatchObject({ status: 'completed', finishReason: 'stop', usage: { provenance: 'provider_reported', value: { prompt_tokens: 3 } } })
    expect(value.terminate('completed')).toBe(done)
    expect(() => value.appendContent('late', 3)).toThrow(/terminal/)
  })

  it('requires usage owner identity to match the carrying choice', () => {
    expect(() => assembler().setUsage({ total_tokens: 1 }, 'provider_reported', 1, 'response', 1)).toThrow(/owner/)
  })

  it('rejects secret-shaped or unbounded usage instead of persisting arbitrary provider data', () => {
    const value = assembler()
    expect(() => value.setUsage({ api_key: 'secret' }, 'provider_reported', 5)).toThrow(/unrecognized|bounded safe JSON/i)
    expect(value.appendContent('still-valid', 1)).toMatchObject({ lastSequence: 1 })
    expect(() => assembler().setUsage({ nested: { access_token: 'secret' } }, 'provider_reported', 1)).toThrow(/bounded safe JSON/)
    expect(() => assembler().setUsage({ prompt_tokens: 'sk-provider-echo' }, 'provider_reported', 1)).toThrow()
    expect(() => assembler().setUsage({ auth: 'Bearer secret' }, 'provider_reported', 1)).toThrow()
  })

  it('rolls back oversized content mutation so a failed terminal remains representable', () => {
    const value = assembler()
    expect(() => value.appendContent('x'.repeat(16 * 1024 * 1024 + 1), 1)).toThrow()
    const error = { network: buildCompatibleNetworkError({ code: 'compatible_response_overflow', stage: 'stream' }), diagnostic: { category: 'lifecycle' as const } }
    expect(value.terminate('failed', error)).toMatchObject({ status: 'failed', lastSequence: 0, blocks: [] })
  })

  it('enforces the aggregate projection limit before freezing terminal state', () => {
    const value = assembler()
    const chunk = 'x'.repeat(11 * 1024 * 1024)
    value.appendContent(chunk, 1)
    value.appendContentParts([], 2)
    value.appendContent(chunk, 3)
    value.appendContentParts([], 4)
    expect(() => value.appendContent(chunk, 5)).toThrow(/Projection exceeds byte limit/)
    expect(value.terminate('aborted')).toMatchObject({ status: 'aborted', lastSequence: 4 })
  })

  it('reserves the 31–32 MiB headroom exclusively for terminal metadata', () => {
    const base = assembler().snapshot()
    const empty = { ...base, lastSequence: 1, blocks: [
      { kind: 'content' as const, blockId: 'content-0', ordinal: 0, sequenceStart: 1, sequenceEnd: 1, text: '' },
      { kind: 'content' as const, blockId: 'content-1', ordinal: 1, sequenceStart: 1, sequenceEnd: 1, text: '' },
    ] }
    const encoder = new TextEncoder()
    const available = 31 * 1024 * 1024 - encoder.encode(JSON.stringify(empty)).byteLength
    const first = Math.floor(available / 2)
    const streaming = { ...empty, blocks: [{ ...empty.blocks[0]!, text: 'x'.repeat(first) }, { ...empty.blocks[1]!, text: 'x'.repeat(available - first) }] }
    expect(encoder.encode(JSON.stringify(streaming)).byteLength).toBe(31 * 1024 * 1024)
    expect(compatibleDurableChoiceProjectionSchema.parse(streaming).status).toBe('streaming')
    const terminal = { ...streaming, status: 'failed' as const, terminalCause: 'error' as const, error: { network: buildCompatibleNetworkError({ code: 'compatible_network_unknown', stage: 'lifecycle' }), diagnostic: { category: 'lifecycle' as const } } }
    expect(encoder.encode(JSON.stringify(terminal)).byteLength).toBeGreaterThan(31 * 1024 * 1024)
    expect(compatibleDurableChoiceProjectionSchema.parse(terminal).status).toBe('failed')
  })

  it('requires a safe error for failed and forbids it on non-failed terminal state', () => {
    const error = buildCompatibleNetworkError({ code: 'compatible_timeout', stage: 'stream' })
    const envelope = { network: error, diagnostic: { category: 'lifecycle' as const } }
    expect(assembler().terminate('failed', envelope)).toMatchObject({ status: 'failed', error: { network: { code: 'compatible_timeout' }, diagnostic: { category: 'lifecycle' } } })
    expect(() => assembler().terminate('failed')).toThrow(/Failed projection/)
    expect(() => assembler().terminate('aborted', envelope)).toThrow(/Only failed/)
  })

  it('rejects noncanonical persisted projections and sequence rollback', () => {
    const value = assembler()
    value.appendContent('a', 2)
    expect(() => value.appendContent('b', 1)).toThrow(/sequence/)
    expect(() => compatibleDurableChoiceProjectionSchema.parse({ ...value.snapshot(), blocks: value.snapshot().blocks.map((block) => ({ ...block, ordinal: 4 })) })).toThrow(/canonically ordered/)
  })

  it('isolates choice identity and only stores raw extension references', () => {
    const value = assembler()
    value.setRawExtensionRecordIds(['ocp_raw_extension_12345678'])
    expect(value.snapshot().rawExtensionRecordIds).toEqual(['ocp_raw_extension_12345678'])
    expect(JSON.stringify(value.snapshot())).not.toContain('api_key')
    expect(() => value.upsertToolCall({ ...tool(), choiceIndex: 1 })).toThrow(/identity/)
  })
})
