import { describe, expect, it } from 'vitest'
import type { CompatibleToolCall, CompatibleToolResult } from '../domain'
import type { CompatibleRequestProfileConfig } from '../schemas'
import { buildCompatibleChatRequest } from '../request/buildCompatibleChatRequest'
import { reconstructCompatibleToolMessages } from './toolContextReconstruction'

const call = (overrides: Partial<CompatibleToolCall> = {}): CompatibleToolCall => ({
  routeProvenanceId: 'ocp_route_12345678' as CompatibleToolCall['routeProvenanceId'],
  messageId: 'a1', choiceIndex: 0, toolIndex: 0, toolCallId: 'call-1', toolType: 'function', functionName: 'lookup',
  argumentsText: '{ "q": "weather" }', argumentsObserved: true, argumentsJson: '{ "q": "weather" }', status: 'complete',
  parseErrorCode: null, executionState: 'not_executed', sequenceStart: 1, sequenceEnd: 3, createdAtMs: 1, updatedAtMs: 2,
  ...overrides,
})

const result = (overrides: Partial<CompatibleToolResult> = {}): CompatibleToolResult => ({
  toolResultMessageId: 't1', routeProvenanceId: 'ocp_route_12345678' as CompatibleToolResult['routeProvenanceId'],
  toolCallId: 'call-1', contentJson: '"sunny"', messageSequence: 4, createdAtMs: 4, ...overrides,
})

describe('reconstructCompatibleToolMessages', () => {
  it('reconstructs assistant tool calls and ordered role=tool messages from structured records', () => {
    const messages = reconstructCompatibleToolMessages({
      calls: [call({ toolIndex: 1, toolCallId: 'call-2', functionName: 'later' }), call()],
      results: [result({ toolResultMessageId: 't2', toolCallId: 'call-2', contentJson: '{"ok":true}', messageSequence: 5 }), result()],
      assistantContent: null,
    })
    expect(messages).toEqual([
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{ "q": "weather" }' } },
        { id: 'call-2', type: 'function', function: { name: 'later', arguments: '{ "q": "weather" }' } },
      ] },
      { role: 'tool', tool_call_id: 'call-1', content: 'sunny' },
      { role: 'tool', tool_call_id: 'call-2', content: '{"ok":true}' },
    ])
  })

  it('feeds the reconstructed chain directly into the strict TP-07 request builder', () => {
    const messages = reconstructCompatibleToolMessages({ calls: [call()], results: [result()] })
    const profile: CompatibleRequestProfileConfig = {
      schemaVersion: 1,
      standardFieldOwnership: 'builder',
      unsupportedFieldPolicy: 'error_before_fetch',
      defaults: {},
      extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
    }
    expect(buildCompatibleChatRequest({ modelId: 'model-a', messages, stream: true, profile }).body.messages).toEqual(messages)
  })

  it('blocks malformed/incomplete calls and orphan results without UI/meta fallback', () => {
    expect(() => reconstructCompatibleToolMessages({ calls: [call({ status: 'malformed', argumentsJson: null, parseErrorCode: 'tool_arguments_malformed' })], results: [] }))
      .toThrow(/replay_blocked/)
    expect(() => reconstructCompatibleToolMessages({ calls: [call()], results: [result({ toolCallId: 'unknown' })] }))
      .toThrow(/result_orphan/)
    expect(() => reconstructCompatibleToolMessages({ calls: [call()], results: [] })).toThrow(/result_missing/)
    expect(() => reconstructCompatibleToolMessages({ calls: [call()], results: [result(), result({ toolResultMessageId: 't2', messageSequence: 5 })] }))
      .toThrow(/result_duplicate/)
    expect(() => reconstructCompatibleToolMessages({ calls: [], results: [] })).toThrow(/replay_empty/)
    expect(() => reconstructCompatibleToolMessages({ calls: [call({ argumentsJson: '{"different":true}' })], results: [result()] }))
      .toThrow(/replay_blocked/)
    expect(() => reconstructCompatibleToolMessages({
      calls: [call(), call({ toolIndex: 1, toolCallId: 'call-2', choiceIndex: 1 })],
      results: [result(), result({ toolResultMessageId: 't2', toolCallId: 'call-2', messageSequence: 5 })],
    })).toThrow(/identity_conflict/)
  })
})
