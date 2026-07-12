import type { CompatibleRequestContentPart, CompatibleRequestMessage } from '../request'
import { projectCompatibleReasoningReplay, type CompatibleReasoningReplayPolicy } from '../reasoning'
import type { CompatibleDurableChoiceProjection } from './compatibleDisplayProjection'
import type { CompatibleToolCall, CompatibleToolResult } from '../domain'

type HistoricalBundle = Readonly<{
  route: Readonly<{ routeProvenanceId: string; responseProfileId: string; responseProfileVersion: number; reasoningMappingId: string; reasoningMappingVersion: number }>
  reasoningMapping: Readonly<{ mappingId: string; version: number; config: Readonly<{ replay: CompatibleReasoningReplayPolicy }> }> | null
  choices: readonly CompatibleDurableChoiceProjection[]
  toolChains?: readonly Readonly<{ choiceIndex: number; calls: readonly CompatibleToolCall[]; results: readonly CompatibleToolResult[] }>[]
}>

export function projectCompatiblePersistedHistory(bundle: HistoricalBundle): readonly Readonly<{
  messageId: string
  choiceIndex: number
  message: Extract<CompatibleRequestMessage, { role: 'assistant' }>
  assistantField?: Readonly<{ name: string; value: string }>
  historicalPin: Readonly<{ routeProvenanceId: string; responseProfileId: string; responseProfileVersion: number; reasoningMappingId: string; reasoningMappingVersion: number }>
}>[] {
  const mapping = bundle.reasoningMapping
  if (mapping && (mapping.mappingId !== bundle.route.reasoningMappingId || mapping.version !== bundle.route.reasoningMappingVersion)) throw new Error('compatible_history_mapping_pin_mismatch')
  return Object.freeze(bundle.choices.map((choice) => {
    const reasoning = choice.blocks.filter((block) => block.kind === 'reasoning').map((block) => block.text).join('')
    const replay = projectCompatibleReasoningReplay({
      reasoning,
      historicalPin: {
        routeProvenanceId: bundle.route.routeProvenanceId, assistantMessageId: choice.messageId, choiceIndex: choice.choiceIndex,
        responseProfileId: bundle.route.responseProfileId, responseProfileVersion: bundle.route.responseProfileVersion,
        reasoningMappingId: bundle.route.reasoningMappingId, reasoningMappingVersion: bundle.route.reasoningMappingVersion,
        replayPolicy: mapping?.config.replay ?? { format: 'disabled', scope: 'never' },
      },
      structuredToolChain: bundle.toolChains?.find((chain) => chain.choiceIndex === choice.choiceIndex) ?? null,
    })
    const contentParts: CompatibleRequestContentPart[] = []
    for (const block of choice.blocks) {
      if (block.kind === 'content') contentParts.push({ type: 'text', text: block.text })
      else if (block.kind === 'content_parts') for (const part of block.parts) {
        if (part.kind === 'text') contentParts.push({ type: 'text', text: part.text })
        else if (part.kind === 'image_url') contentParts.push({ type: 'image_url', image_url: { url: part.url, ...(part.detail ? { detail: part.detail } : {}) } })
        else if (part.kind === 'refusal') contentParts.push({ type: 'text', text: part.text })
      }
    }
    if (replay.contentPrefix) contentParts.unshift({ type: 'text', text: replay.contentPrefix })
    const toolCalls = choice.blocks.flatMap((block) => block.kind === 'tool_call' && block.status === 'complete' && block.toolCallId && block.functionName
      ? [{ id: block.toolCallId, type: 'function' as const, function: { name: block.functionName, arguments: block.argumentsText } }]
      : [])
    const onlyText = contentParts.every((part) => part.type === 'text')
    const content = onlyText ? contentParts.map((part) => part.type === 'text' ? part.text : '').join('') : contentParts
    return Object.freeze({
      messageId: choice.messageId, choiceIndex: choice.choiceIndex,
      message: Object.freeze({ role: 'assistant' as const, content: content || null, ...(toolCalls.length > 0 ? { tool_calls: Object.freeze(toolCalls) } : {}) }),
      ...(replay.assistantField ? { assistantField: replay.assistantField } : {}),
      historicalPin: Object.freeze({ routeProvenanceId: bundle.route.routeProvenanceId, responseProfileId: bundle.route.responseProfileId, responseProfileVersion: bundle.route.responseProfileVersion, reasoningMappingId: bundle.route.reasoningMappingId, reasoningMappingVersion: bundle.route.reasoningMappingVersion }),
    })
  }))
}
