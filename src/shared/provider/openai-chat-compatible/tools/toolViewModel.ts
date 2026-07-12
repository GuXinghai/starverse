import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleToolAggregate, CompatibleToolSafeView } from './toolTypes'

export function toCompatibleToolSafeView(call: CompatibleToolAggregate): CompatibleToolSafeView {
  let parsedArguments: CompatibleJsonValue | null = null
  if (call.argumentsJson !== null) {
    try {
      parsedArguments = JSON.parse(call.argumentsJson) as CompatibleJsonValue
    } catch {
      parsedArguments = null
    }
  }
  return Object.freeze({
    toolIndex: call.toolIndex,
    toolCallId: call.toolCallId,
    functionName: call.functionName,
    argumentsText: call.argumentsText,
    parsedArguments,
    status: call.status,
    diagnosticCode: call.diagnosticCode,
    executionState: 'not_executed',
    sequenceStart: call.sequenceStart,
    sequenceEnd: call.sequenceEnd,
  })
}
