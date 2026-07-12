import type { CompatibleReasoningReplayPolicy } from './reasoningTypes'
import type { CompatibleToolCall, CompatibleToolResult } from '../domain'

export function projectCompatibleReasoningReplay(input: Readonly<{
  reasoning: string
  historicalPin: Readonly<{ routeProvenanceId: string; assistantMessageId: string; choiceIndex: number; responseProfileId: string; responseProfileVersion: number; reasoningMappingId: string; reasoningMappingVersion: number; replayPolicy: CompatibleReasoningReplayPolicy }>
  structuredToolChain: Readonly<{ calls: readonly CompatibleToolCall[]; results: readonly CompatibleToolResult[] }> | null
}>): Readonly<{ assistantField?: Readonly<{ name: string; value: string }>; contentPrefix?: string }> {
  const policy = input.historicalPin.replayPolicy
  if (!input.reasoning || policy.format === 'disabled') return Object.freeze({})
  if (policy.scope === 'tool_call_chain_only' && !isExactToolChain(input.historicalPin, input.structuredToolChain)) return Object.freeze({})
  if (policy.format === 'assistant_field') return Object.freeze({ assistantField: Object.freeze({ name: policy.field, value: input.reasoning }) })
  return Object.freeze({ contentPrefix: `${policy.openTag}${input.reasoning}${policy.closeTag}` })
}

function isExactToolChain(pin: Readonly<{ routeProvenanceId: string; assistantMessageId: string; choiceIndex: number }>, chain: Readonly<{ calls: readonly CompatibleToolCall[]; results: readonly CompatibleToolResult[] }> | null): boolean {
  if (!chain || chain.calls.length === 0 || chain.calls.some((call) => call.routeProvenanceId !== pin.routeProvenanceId || call.messageId !== pin.assistantMessageId || call.choiceIndex !== pin.choiceIndex || call.status !== 'complete' || !call.toolCallId)) return false
  const ids = new Set(chain.calls.map((call) => call.toolCallId!))
  if (ids.size !== chain.calls.length) return false
  return chain.results.length === ids.size && chain.results.every((result) => result.routeProvenanceId === pin.routeProvenanceId && ids.delete(result.toolCallId)) && ids.size === 0
}
