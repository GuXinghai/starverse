import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import type { DomainEvent } from '@/next/state/types'
import type { StreamJsonChunkMapper } from '@/next/streaming/core/types'

const KNOWN_FINISH_REASONS = new Set(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])

/**
 * Minimal OpenAI Chat Completions wire mapper shared only by the existing local
 * endpoint products. It is not a cloud provider identity or the canonical
 * compatible runtime introduced by later task packages.
 */
export const mapLocalOpenAIChatCompletionsChunkToEvents: StreamJsonChunkMapper = (input) => {
  const { chunk, messageId } = input
  const choiceIndex = typeof input.choiceIndex === 'number' ? input.choiceIndex : 0
  const events: DomainEvent[] = []

  if (!chunk || typeof chunk !== 'object') return events
  const record = chunk as Record<string, unknown>

  pushMeta(events, record)

  const error = record.error
  if (error && typeof error === 'object') {
    events.push({
      type: 'StreamError',
      error: localEndpointErrorEnvelope(error),
      terminal: true,
    })
    return events
  }

  if (record.usage) {
    events.push({ type: 'UsageDelta', usage: record.usage })
  }

  const choices = Array.isArray(record.choices) ? record.choices : []
  const choice = choices[choiceIndex]
  if (!choice || typeof choice !== 'object') return events

  const choiceRecord = choice as Record<string, unknown>
  const delta = choiceRecord.delta && typeof choiceRecord.delta === 'object'
    ? choiceRecord.delta as Record<string, unknown>
    : null
  const message = choiceRecord.message && typeof choiceRecord.message === 'object'
    ? choiceRecord.message as Record<string, unknown>
    : null

  const content = delta?.content ?? message?.content
  if (typeof content === 'string' && content.length > 0) {
    events.push({
      type: 'MessageDeltaText',
      messageId,
      choiceIndex,
      text: content,
    })
  }

  const nativeFinishReason = typeof choiceRecord.finish_reason === 'string'
    ? choiceRecord.finish_reason
    : undefined
  if (nativeFinishReason) {
    events.push({
      type: 'MetaDelta',
      meta: {
        finish_reason: normalizeFinishReason(nativeFinishReason),
        native_finish_reason: nativeFinishReason,
      },
    })
  }

  return events
}

function pushMeta(events: DomainEvent[], chunk: Record<string, unknown>) {
  const id = typeof chunk.id === 'string' ? chunk.id : undefined
  const model = typeof chunk.model === 'string' ? chunk.model : undefined
  if (!id && !model) return
  events.push({
    type: 'MetaDelta',
    meta: { id, model },
  })
}

function normalizeFinishReason(native: string): string {
  return KNOWN_FINISH_REASONS.has(native) ? native : 'unknown'
}

function localEndpointErrorEnvelope(error: unknown): ErrorEnvelope {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const code = typeof record.code === 'string'
    ? record.code
    : typeof record.type === 'string'
      ? record.type
      : 'local_chat_completions_error'
  const message = typeof record.message === 'string' ? record.message : 'Local chat endpoint error'
  return {
    phase: 'mid_stream',
    completionClass: 'error',
    openrouter: {
      code,
      message,
      provider: 'local_chat_completions',
      metadata: { provider_name: 'local_chat_completions' },
    },
    truncated: false,
  } as ErrorEnvelope
}
