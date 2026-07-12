import type { CompatibleToolCall, CompatibleToolResult } from '../domain'
import type { CompatibleRequestMessage, CompatibleRequestToolCall } from '../request/messageTypes'

export function reconstructCompatibleToolMessages(input: Readonly<{
  calls: readonly CompatibleToolCall[]
  results: readonly CompatibleToolResult[]
  assistantContent?: string | null
}>): readonly CompatibleRequestMessage[] {
  const calls = [...input.calls].sort((left, right) => left.toolIndex - right.toolIndex)
  if (calls.length === 0) throw new Error('compatible_tool_replay_empty')
  const identity = calls[0]
  const seenIndexes = new Set<number>()
  const seenCallIds = new Set<string>()
  const requestCalls: CompatibleRequestToolCall[] = calls.map((call) => {
    if (call.status !== 'complete' || !call.toolCallId || call.toolType !== 'function' || !call.functionName || call.argumentsJson === null) {
      throw new Error('compatible_tool_replay_blocked')
    }
    if (call.routeProvenanceId !== identity.routeProvenanceId || call.messageId !== identity.messageId || call.choiceIndex !== identity.choiceIndex ||
      seenIndexes.has(call.toolIndex) || seenCallIds.has(call.toolCallId)) throw new Error('compatible_tool_replay_identity_conflict')
    let parsedArguments: unknown
    try { parsedArguments = JSON.parse(call.argumentsText) } catch { throw new Error('compatible_tool_replay_blocked') }
    if (call.argumentsJson !== call.argumentsText || !parsedArguments || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
      throw new Error('compatible_tool_replay_blocked')
    }
    seenIndexes.add(call.toolIndex)
    seenCallIds.add(call.toolCallId)
    return Object.freeze({
      id: call.toolCallId,
      type: 'function' as const,
      function: Object.freeze({ name: call.functionName, arguments: call.argumentsText }),
    })
  })
  const messages: CompatibleRequestMessage[] = [Object.freeze({
    role: 'assistant' as const,
    content: input.assistantContent ?? null,
    tool_calls: Object.freeze(requestCalls),
  })]
  const callIds = new Set(requestCalls.map((call) => call.id))
  const results = [...input.results].sort((left, right) => left.messageSequence - right.messageSequence)
  for (const result of results) {
    if (result.routeProvenanceId !== identity.routeProvenanceId || !callIds.has(result.toolCallId)) throw new Error('compatible_tool_result_orphan')
  }
  const resultIds = new Set(results.map((result) => result.toolCallId))
  if (resultIds.size !== results.length) throw new Error('compatible_tool_result_duplicate')
  for (const callId of callIds) {
    if (!resultIds.has(callId)) throw new Error('compatible_tool_result_missing')
  }
  for (const result of results) {
    let parsed: unknown
    try {
      parsed = JSON.parse(result.contentJson)
    } catch {
      throw new Error('compatible_tool_result_invalid')
    }
    messages.push(Object.freeze({
      role: 'tool' as const,
      tool_call_id: result.toolCallId,
      content: typeof parsed === 'string' ? parsed : result.contentJson,
    }))
  }
  return Object.freeze(messages)
}
