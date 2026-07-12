import { describe, expect, it } from 'vitest'
import type { CompatibleReasoningChoiceState } from '../reasoning'
import { CompatibleTurnProjector } from './compatibleTurnProjector'

const routeProvenanceId = 'ocp_route_12345678'
const projector = () => new CompatibleTurnProjector({ routeProvenanceId, choices: [{ choiceIndex: 0, messageId: 'a1' }, { choiceIndex: 1, messageId: 'a2' }], reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_preferred_with_builtin_fallback' })

function reasoningState(): CompatibleReasoningChoiceState {
  return { context: { routeProvenanceId, messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [] }, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback', status: 'terminal', lockedSource: 'reasoning', lockedSourceKey: 'reasoning', value: 'why', selectedSegmentIds: ['reasoning-1'], conflicts: [] }
}

describe('CompatibleTurnProjector', () => {
  it('maps real wire events plus selected reasoning into ordered durable display projections', () => {
    const value = projector()
    value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 1, choiceIndex: 0, content: 'answer-' })
    value.applyReasoningBlock({ choiceIndex: 0, blockId: 'reasoning-1', segmentId: 'reasoning-1', text: 'why', sequenceStart: 2, sequenceEnd: 2, state: reasoningState() })
    value.applyWireEvent({ kind: 'tool_fragment', source: 'stream', sequence: 3, choiceIndex: 0, fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'lookup', argumentsFragment: '{}' } })
    value.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 4, choiceIndex: 0, finishReason: 'tool_calls' })
    value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 5, choiceIndex: 1, content: [{ type: 'text', text: 'second' }] })
    value.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 6, choiceIndex: 1, finishReason: 'stop' })
    value.applyWireEvent({ kind: 'usage', source: 'stream', sequence: 7, usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } })
    const terminal = value.applyWireEvent({ kind: 'terminal', source: 'stream', sequence: 8, outcome: 'done' })
    expect(terminal[0]).toMatchObject({ status: 'completed', terminalCause: 'done', usage: { scope: 'response', ownerChoiceIndex: 0, provenance: 'provider_reported' }, blocks: [{ kind: 'content' }, { kind: 'reasoning' }, { kind: 'tool_call', status: 'complete' }] })
    expect(terminal[1]).toMatchObject({ status: 'completed', usage: null, blocks: [{ kind: 'content_parts', parts: [{ kind: 'text', text: 'second' }] }] })
  })

  it('persists EOF without DONE as interrupted rather than completed', () => {
    const value = projector()
    value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 1, choiceIndex: 0, content: 'partial' })
    value.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 2, choiceIndex: 0, finishReason: null })
    value.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 3, choiceIndex: 1, finishReason: null })
    expect(value.applyWireEvent({ kind: 'terminal', source: 'stream', sequence: 4, outcome: 'eof_without_done' })).toEqual([
      expect.objectContaining({ status: 'interrupted', terminalCause: 'eof_without_done', blocks: [expect.objectContaining({ text: 'partial' })] }),
      expect.objectContaining({ status: 'interrupted', terminalCause: 'eof_without_done' }),
    ])
  })

  it('records unknown usage diagnostics without placing provider-controlled strings in projection', () => {
    const value = projector()
    value.applyWireEvent({ kind: 'usage', source: 'stream', sequence: 1, usage: { prompt_tokens: 'sk-provider-echo', auth: 'Bearer secret' } })
    expect(value.snapshots().every((choice) => choice.usage === null)).toBe(true)
    expect(value.diagnostics()).toEqual(['usage_unrecognized'])
  })

  it('maps content parts to strict neutral shapes and drops provider-controlled extra fields', () => {
    const value = projector()
    const result = value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 1, choiceIndex: 0, content: [{ type: 'text', text: 'safe', authorization: 'Bearer secret', vendor_raw: { api_key: 'secret' } }] })
    expect(result[0]?.blocks).toEqual([expect.objectContaining({ kind: 'content_parts', parts: [{ kind: 'text', text: 'safe' }] })])
    expect(JSON.stringify(result)).not.toContain('Bearer secret')
    expect(JSON.stringify(result)).not.toContain('api_key')
    const image = value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 2, choiceIndex: 0, content: [{ type: 'image_url', image_url: { url: 'https://cdn.example.test/image.png?signature=secret#fragment', detail: 'high' } }] })
    expect(image[0]?.blocks.at(-1)).toMatchObject({ kind: 'content_parts', parts: [{ kind: 'image_url', url: 'https://cdn.example.test/image.png', detail: 'high' }] })
    expect(JSON.stringify(image)).not.toContain('signature')
  })

  it('maps safe terminal errors for every choice and rejects late events', () => {
    const value = projector()
    const terminal = value.applyWireEvent({ kind: 'terminal', source: 'stream', sequence: 1, outcome: 'error', error: { network: { code: 'compatible_timeout', stage: 'stream', safeMessage: 'The provider request timed out.', retryable: true }, diagnostic: { category: 'lifecycle' } } })
    expect(terminal.every((choice) => choice.status === 'failed' && choice.error?.network.code === 'compatible_timeout')).toBe(true)
    expect(() => value.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 2, choiceIndex: 0, content: 'late' })).toThrow(/terminal/)
  })
})
