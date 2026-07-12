import { describe, expect, it } from 'vitest'
import { compatibleReasoningPolicySchema, CompatibleReasoningSourceLock, projectCompatibleReasoningCandidate, projectCompatibleReasoningReplay, projectMappedCompatibleReasoningCandidate } from './index'
import type { CompatibleToolCall, CompatibleToolResult } from '../domain'

const context = { routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [] } as const
const candidate = (source: 'custom' | 'reasoning' | 'reasoning_content' | 'thinking' | 'inline', value: string, sequence = 1, phase: 'stream' | 'final' = 'stream', mode: 'append' | 'snapshot' = phase === 'final' ? 'snapshot' : 'append', sourceKey: string = source) => ({ context, choiceIndex: 0, sequence, phase, source, sourceKey, mode, value }) as const
const historicalPinBase = { routeProvenanceId: context.routeProvenanceId, assistantMessageId: 'a1', choiceIndex: 0, responseProfileId: context.responseProfileId, responseProfileVersion: 1, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1 } as const

describe('compatible reasoning mapping validation', () => {
  it('accepts only the two frozen modes and defaults replay off', () => {
    expect(compatibleReasoningPolicySchema.parse({ mode: 'custom_only', rules: [] }).replay).toEqual({ format: 'disabled', scope: 'never' })
    expect(() => compatibleReasoningPolicySchema.parse({ mode: 'builtin_first', rules: [] })).toThrow()
  })

  it('rejects executable paths and invalid semantic/mode combinations', () => {
    expect(() => compatibleReasoningPolicySchema.parse({ mode: 'custom_only', rules: [{ stream: { path: '__proto__.x', mode: 'append' }, semantic: 'text' }] })).toThrow()
    expect(() => compatibleReasoningPolicySchema.parse({ mode: 'custom_only', rules: [{ stream: { path: 'x', mode: 'snapshot' }, final: { path: 'y', mode: 'blocks' }, semantic: 'text' }] })).toThrow()
    expect(() => compatibleReasoningPolicySchema.parse({ mode: 'custom_only', rules: [{ stream: { path: 'x.*', mode: 'snapshot', textPath: 'items.*.text' }, semantic: 'blocks' }] })).toThrow()
  })
})

describe('compatible reasoning candidate projection', () => {
  it('accepts nonempty text and string arrays but not null/empty/objects', () => {
    expect(projectCompatibleReasoningCandidate({ context, choiceIndex: 0, sequence: 1, phase: 'stream', source: 'reasoning', sourceKey: 'reasoning', mode: 'append', value: [' a', 'b '] })).toMatchObject({ value: ' ab ' })
    expect(projectCompatibleReasoningCandidate({ context, choiceIndex: 0, sequence: 1, phase: 'stream', source: 'reasoning', sourceKey: 'reasoning', mode: 'append', value: '   ' })).toBeNull()
    expect(projectCompatibleReasoningCandidate({ context, choiceIndex: 0, sequence: 1, phase: 'stream', source: 'reasoning', sourceKey: 'reasoning', mode: 'append', value: { text: 'x' } })).toBeNull()
  })
  it('projects declared textPath/blocks and keeps opaque values non-displayable', () => {
    const base = { context, choiceIndex: 0, sequence: 1, phase: 'stream' as const, sourceKey: 'custom:m:1:x' }
    expect(projectMappedCompatibleReasoningCandidate({ ...base, value: { payload: [{ text: 'x' }] }, rule: { stream: { mode: 'append', textPath: 'payload.0.text' }, semantic: 'text' } })).toMatchObject({ value: 'x', mode: 'append' })
    expect(projectMappedCompatibleReasoningCandidate({ ...base, value: [{ text: 'a' }, { text: 'b' }], rule: { stream: { mode: 'snapshot', textPath: 'text' }, semantic: 'blocks' } })).toMatchObject({ value: 'ab', mode: 'snapshot' })
    expect(projectMappedCompatibleReasoningCandidate({ ...base, value: [{ text: 'a' }, {}], rule: { stream: { mode: 'snapshot', textPath: 'text' }, semantic: 'blocks' } })).toBeNull()
    expect(projectMappedCompatibleReasoningCandidate({ ...base, value: { signature: 'x' }, rule: { stream: { mode: 'snapshot' }, semantic: 'opaque' } })).toBeNull()
  })
})

describe('compatible per-choice reasoning source lock', () => {
  it('locks same-event priority and never switches to a late custom source', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.acceptEvent([candidate('thinking', 't'), candidate('reasoning', 'r')])).toMatchObject({ lockedSource: 'reasoning', value: 'r' })
    expect(lock.acceptEvent([candidate('custom', 'c', 2)])).toMatchObject({ lockedSource: 'reasoning', value: 'r', conflicts: [expect.objectContaining({ kind: 'multiple_sources_in_same_event' }), expect.objectContaining({ kind: 'late_higher_priority_source' })] })
  })

  it('custom-only never locks builtin or inline candidates', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_only' })
    expect(lock.acceptEvent([candidate('reasoning', 'r'), candidate('inline', 'i')])).toMatchObject({ status: 'unselected', lockedSource: null })
    expect(lock.acceptEvent([candidate('custom', 'c', 2)])).toMatchObject({ lockedSource: 'custom', value: 'c' })
  })

  it('does not lock a direct empty candidate', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.acceptEvent([candidate('reasoning', '   ')])).toMatchObject({ status: 'unselected', lockedSource: null })
  })

  it('reconciles only the locked final source and empty candidates cannot clear text', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    lock.acceptEvent([candidate('reasoning', 'stream')])
    expect(lock.finalize([candidate('reasoning_content', 'other', 2, 'final')])).toMatchObject({ status: 'terminal', lockedSource: 'reasoning', value: 'stream', conflicts: [expect.objectContaining({ kind: 'final_source_mismatch' })] })
  })

  it('preserves spaces and repeated append tokens without text heuristics', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    lock.acceptEvent([candidate('reasoning', 'a', 1)])
    expect(lock.acceptEvent([candidate('reasoning', ' a', 2)])).toMatchObject({ value: 'a a' })
    expect(lock.acceptEvent([candidate('reasoning', 'a', 3)])).toMatchObject({ value: 'a aa' })
  })

  it('applies priority to a non-stream final event regardless of input order', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.finalize([candidate('thinking', 't', 1, 'final'), candidate('custom', 'c', 1, 'final')])).toMatchObject({ lockedSource: 'custom', value: 'c' })
  })
  it.each([
    [candidate('custom', 'small', 1, 'final'), candidate('thinking', '界'.repeat(400_000), 1, 'final')],
    [candidate('thinking', '界'.repeat(400_000), 1, 'final'), candidate('custom', 'small', 1, 'final')],
  ])('budgets only the selected final source regardless of input order', (...event) => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(lock.finalize(event)).toMatchObject({ lockedSource: 'custom', value: 'small' })
  })

  it('handles locked same-event multiple sources atomically and exact event replay is idempotent', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    lock.acceptEvent([candidate('reasoning', 'a', 1)])
    const event = [candidate('reasoning', 'b', 2), candidate('thinking', 'other', 2)]
    expect(lock.acceptEvent(event)).toMatchObject({ value: 'ab', conflicts: [expect.objectContaining({ kind: 'late_lower_priority_source' })] })
    expect(lock.acceptEvent(event)).toMatchObject({ value: 'ab' })
    expect(() => lock.acceptEvent([candidate('reasoning', 'changed', 2)])).toThrow(/sequence_conflict/)
    expect(lock.snapshot()).toMatchObject({ value: 'ab' })
  })

  it('locks one exact custom rule and diagnoses a second custom path', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_only' })
    expect(lock.acceptEvent([candidate('custom', 'a', 1, 'stream', 'append', 'custom:m:1:pathA')])).toMatchObject({ lockedSourceKey: 'custom:m:1:pathA', value: 'a' })
    expect(lock.acceptEvent([candidate('custom', 'b', 2, 'stream', 'append', 'custom:m:1:pathB')])).toMatchObject({ lockedSourceKey: 'custom:m:1:pathA', value: 'a', conflicts: [expect.objectContaining({ kind: 'different_value_source' })] })
  })

  it('makes terminal finalize exact-idempotent and rejects changed finals', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    const final = [candidate('reasoning', 'final', 1, 'final')]
    expect(lock.finalize(final)).toMatchObject({ status: 'terminal', value: 'final' })
    expect(lock.finalize(final)).toMatchObject({ status: 'terminal', value: 'final' })
    expect(() => lock.finalize([candidate('reasoning', 'changed', 1, 'final')])).toThrow(/terminal_conflict/)
    expect(() => lock.finalize([{ ...final[0]!, choiceIndex: 1 }])).toThrow(/identity_mismatch/)
  })

  it('rejects mixed choice identity', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(() => lock.acceptEvent([{ ...candidate('reasoning', 'x'), choiceIndex: 1 }])).toThrow(/identity_mismatch/)
  })
  it('rejects UTF-8 reasoning overflow before locking', () => {
    const lock = new CompatibleReasoningSourceLock({ context, choiceIndex: 0, mode: 'custom_preferred_with_builtin_fallback' })
    expect(() => lock.acceptEvent([candidate('reasoning', '界'.repeat(400_000))])).toThrow(/value_overflow/)
    expect(lock.snapshot()).toMatchObject({ status: 'unselected', value: '' })
    expect(lock.acceptEvent([candidate('reasoning', 'ok')])).toMatchObject({ status: 'locked', value: 'ok' })
  })
})

describe('compatible reasoning history replay', () => {
  it('is disabled by default and requires exact structured tool-chain scope', () => {
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin: { ...historicalPinBase, replayPolicy: { format: 'disabled', scope: 'never' } }, structuredToolChain: null })).toEqual({})
    const policy = { format: 'assistant_field', field: 'reasoning_content', scope: 'tool_call_chain_only' } as const
    const historicalPin = { ...historicalPinBase, replayPolicy: policy }
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin, structuredToolChain: null })).toEqual({})
    const call = { routeProvenanceId: context.routeProvenanceId, messageId: 'a1', choiceIndex: 0, toolIndex: 0, toolCallId: 'call1', toolType: 'function', functionName: 'f', argumentsText: '{}', argumentsObserved: true, argumentsJson: '{}', status: 'complete', parseErrorCode: null, executionState: 'not_executed', sequenceStart: 1, sequenceEnd: 1, createdAtMs: 1, updatedAtMs: 1 } as unknown as CompatibleToolCall
    const result = { toolResultMessageId: 'tool1', routeProvenanceId: context.routeProvenanceId, toolCallId: 'call1', contentJson: '"ok"', messageSequence: 2, createdAtMs: 2 } as unknown as CompatibleToolResult
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin, structuredToolChain: { calls: [call], results: [result] } })).toEqual({ assistantField: { name: 'reasoning_content', value: 'r' } })
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin, structuredToolChain: { calls: [call], results: [{ ...result, toolCallId: 'other' }] } })).toEqual({})
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin, structuredToolChain: { calls: [call, { ...call, toolIndex: 1 }], results: [result] } })).toEqual({})
    expect(projectCompatibleReasoningReplay({ reasoning: 'r', historicalPin, structuredToolChain: { calls: [{ ...call, choiceIndex: 1 }], results: [result] } })).toEqual({})
  })

  it('uses tags only when explicitly configured', () => {
    expect(projectCompatibleReasoningReplay({ reasoning: 'x', historicalPin: { ...historicalPinBase, replayPolicy: { format: 'assistant_content_tags', openTag: '<r>', closeTag: '</r>', scope: 'all_assistant_messages' } }, structuredToolChain: null })).toEqual({ contentPrefix: '<r>x</r>' })
  })
})
