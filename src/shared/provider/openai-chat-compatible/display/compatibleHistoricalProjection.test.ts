import { describe, expect, it } from 'vitest'
import { CompatibleDisplayAssembler } from './compatibleDisplayProjection'
import { projectCompatiblePersistedHistory } from './compatibleHistoricalProjection'
import { routeProvenanceIdSchema } from '..'

const route = { routeProvenanceId: 'ocp_route_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 3, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 2 }

function choice() {
  const value = new CompatibleDisplayAssembler({ routeProvenanceId: route.routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: route.reasoningMappingId, reasoningMappingVersion: route.reasoningMappingVersion, reasoningMode: 'custom_only' })
  value.upsertReasoning({
    blockId: 'reasoning-1', segmentId: 'segment-1', text: 'historical reasoning', sequenceStart: 1, sequenceEnd: 1,
    state: { context: { routeProvenanceId: route.routeProvenanceId, messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: route.responseProfileId, responseProfileVersion: route.responseProfileVersion, allowedMappings: [] }, choiceIndex: 0, mode: 'custom_only', status: 'terminal', lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think', value: 'historical reasoning', selectedSegmentIds: ['segment-1'], conflicts: [] },
  })
  value.appendContent('answer', 2)
  return value.terminate('completed')
}

describe('projectCompatiblePersistedHistory', () => {
  it('does not replay persisted reasoning when the pinned historical mapping is unavailable or disabled', () => {
    expect(projectCompatiblePersistedHistory({ route, reasoningMapping: null, choices: [choice()] })[0]).toMatchObject({ message: { role: 'assistant', content: 'answer' }, historicalPin: route })
    expect(projectCompatiblePersistedHistory({ route, reasoningMapping: { mappingId: route.reasoningMappingId, version: 2, config: { replay: { format: 'disabled', scope: 'never' } } }, choices: [choice()] })[0]?.message.content).toBe('answer')
  })

  it('uses only the immutable historical replay policy when explicit replay is enabled', () => {
    const result = projectCompatiblePersistedHistory({ route, reasoningMapping: { mappingId: route.reasoningMappingId, version: 2, config: { replay: { format: 'assistant_field', field: 'reasoning_content', scope: 'all_assistant_messages' } } }, choices: [choice()] })[0]
    expect(result).toMatchObject({ message: { content: 'answer' }, assistantField: { name: 'reasoning_content', value: 'historical reasoning' }, historicalPin: route })
  })

  it('replays tool-chain-only reasoning only for an exact persisted call/result chain', () => {
    const reasoningMapping = { mappingId: route.reasoningMappingId, version: 2, config: { replay: { format: 'assistant_field' as const, field: 'reasoning_content', scope: 'tool_call_chain_only' as const } } }
    const pinnedRouteId = routeProvenanceIdSchema.parse(route.routeProvenanceId)
    const calls = [{ routeProvenanceId: pinnedRouteId, messageId: 'a1', choiceIndex: 0, toolIndex: 0, toolCallId: 'call-1', toolType: 'function' as const, functionName: 'lookup', argumentsText: '{}', argumentsObserved: true, argumentsJson: '{}', status: 'complete' as const, parseErrorCode: null, executionState: 'not_executed' as const, sequenceStart: 3, sequenceEnd: 3, createdAtMs: 3, updatedAtMs: 3 }]
    const results = [{ toolResultMessageId: 'tool-result-1', routeProvenanceId: pinnedRouteId, toolCallId: 'call-1', contentJson: '"ok"', messageSequence: 4, createdAtMs: 4 }]
    expect(projectCompatiblePersistedHistory({ route, reasoningMapping, choices: [choice()], toolChains: [{ choiceIndex: 0, calls, results }] })[0]?.assistantField?.value).toBe('historical reasoning')
    expect(projectCompatiblePersistedHistory({ route, reasoningMapping, choices: [choice()], toolChains: [{ choiceIndex: 0, calls, results: [] }] })[0]?.assistantField).toBeUndefined()
  })

  it('fails closed instead of applying a current or mismatched mapping version', () => {
    expect(() => projectCompatiblePersistedHistory({ route, reasoningMapping: { mappingId: route.reasoningMappingId, version: 99, config: { replay: { format: 'assistant_field', field: 'reasoning_content', scope: 'all_assistant_messages' } } }, choices: [choice()] })).toThrow(/pin_mismatch/)
  })
})
